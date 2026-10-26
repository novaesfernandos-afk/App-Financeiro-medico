import { addMonths, buildInstallments, PAYMENT_METHODS, todayISO } from '@medfinance/core';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean } from '../lib/crud';
import { HttpError, notFound, parse, serialize, toDate, zDate, zId, zPositiveMoney, zYearMonth } from '../lib/http';
import { assertOwned } from '../lib/ownership';

const expenseFields = {
  description: z.string().trim().min(1).max(200),
  amount: zPositiveMoney,
  categoryId: zId.nullable().optional(),
  scope: z.enum(['PESSOAL', 'PROFISSIONAL']).optional(),
  competenceDate: zDate,
  dueDate: zDate.optional(),
  paidDate: zDate.nullable().optional(),
  status: z.enum(['PENDENTE', 'PAGO', 'CANCELADO']).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default('PIX'),
  creditCardId: zId.nullable().optional(),
  bankAccountId: zId.nullable().optional(),
  isFixed: z.boolean().optional(),
  costCenter: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
};
const createSchema = z.object({
  ...expenseFields,
  /** Parcelamento: o valor informado é o TOTAL da compra. */
  installments: z.number().int().min(1).max(120).optional(),
  /** Conta recorrente: repete o lançamento por N meses. */
  repeatMonths: z.number().int().min(1).max(60).optional(),
});
const updateSchema = z.object(expenseFields).partial();
type ExpenseBody = z.infer<typeof updateSchema>;

export async function expenseRoutes(app: FastifyInstance) {
  async function checkRefs(b: ExpenseBody, userId: string) {
    await assertOwned(app.prisma, 'expenseCategory', b.categoryId, userId);
    await assertOwned(app.prisma, 'creditCard', b.creditCardId, userId);
    await assertOwned(app.prisma, 'bankAccount', b.bankAccountId, userId);
    if (b.paymentMethod === 'CARTAO_CREDITO' && b.creditCardId === undefined) throw new HttpError(400, 'Selecione o cartão de crédito');
  }
  const toData = (b: ExpenseBody) => clean({
    ...b,
    competenceDate: b.competenceDate ? toDate(b.competenceDate) : undefined,
    dueDate: b.dueDate ? toDate(b.dueDate) : undefined,
    paidDate: b.paidDate ? toDate(b.paidDate) : b.paidDate === null ? null : undefined,
  });
  const include = { category: { select: { id: true, name: true, color: true, isTax: true } }, creditCard: { select: { id: true, name: true } } };

  async function scopeFor(b: ExpenseBody, userId: string) {
    if (b.scope) return b.scope;
    if (!b.categoryId) return 'PESSOAL' as const;
    const c = await app.prisma.expenseCategory.findFirst({ where: { id: b.categoryId, userId } });
    return c?.scope ?? 'PESSOAL';
  }

  app.get('/expenses', async (req) => {
    const q = parse(z.object({ month: zYearMonth.optional(), from: zDate.optional(), to: zDate.optional(), categoryId: zId.optional() }), req.query);
    const from = q.month ? `${q.month}-01` : q.from;
    const to = q.month ? addMonths(`${q.month}-01`, 1) : q.to;
    return serialize(await app.prisma.expense.findMany({
      where: {
        userId: req.userId,
        categoryId: q.categoryId,
        competenceDate: { gte: from ? toDate(from) : undefined, [q.month ? 'lt' : 'lte']: to ? toDate(to) : undefined },
      },
      include,
      orderBy: [{ competenceDate: 'desc' }, { createdAt: 'desc' }],
    }));
  });

  app.post('/expenses', async (req, reply) => {
    const b = parse(createSchema, req.body);
    await checkRefs(b, req.userId);
    if (b.installments && b.repeatMonths) throw new HttpError(400, 'Use parcelamento OU repetição, não ambos');
    const scope = await scopeFor(b, req.userId);
    const onCard = b.paymentMethod === 'CARTAO_CREDITO';
    const status = onCard ? 'PENDENTE' : b.status ?? (b.paidDate ? 'PAGO' : 'PENDENTE');
    const paidDate = status === 'PAGO' ? b.paidDate ?? b.dueDate ?? b.competenceDate : null;
    const { installments, repeatMonths, ...base } = b;

    let rows: ExpenseBody[] = [];
    let groupField: Record<string, string> = {};
    if (installments && installments > 1) {
      const group = randomUUID();
      groupField = { installmentGroupId: group };
      rows = buildInstallments(b.amount, installments, b.competenceDate).map((p, i) => ({
        ...base, amount: p.amount,
        // No cartão, cada parcela entra em uma fatura (mês) diferente
        competenceDate: p.date,
        dueDate: addMonths(b.dueDate ?? b.competenceDate, i),
        status: i === 0 ? status : 'PENDENTE', paidDate: i === 0 ? paidDate : null,
        installmentNumber: p.number, installmentCount: p.count,
      } as ExpenseBody));
    } else if (repeatMonths && repeatMonths > 1) {
      groupField = { recurringGroupId: randomUUID() };
      rows = Array.from({ length: repeatMonths }, (_, i) => ({
        ...base, isFixed: true,
        competenceDate: addMonths(b.competenceDate, i),
        dueDate: addMonths(b.dueDate ?? b.competenceDate, i),
        status: i === 0 ? status : 'PENDENTE', paidDate: i === 0 ? paidDate : null,
      }));
    } else {
      rows = [{ ...base, dueDate: b.dueDate ?? b.competenceDate, status, paidDate }];
    }

    const created = await app.prisma.$transaction(rows.map((r) =>
      app.prisma.expense.create({ data: { ...(toData(r) as object), ...groupField, scope, userId: req.userId } as never, include })));
    await audit(app, req, 'CREATE', 'Expense', created[0]!.id, { count: created.length });
    return reply.status(201).send(serialize(created));
  });

  app.patch('/expenses/:id', async (req) => {
    const { id } = req.params as { id: string };
    const existing = await app.prisma.expense.findFirst({ where: { id, userId: req.userId } });
    if (!existing) throw notFound('Despesa');
    const b = parse(updateSchema.extend({ applyToGroup: z.boolean().optional() }), req.body);
    const { applyToGroup, ...fields } = b;
    await checkRefs(fields, req.userId);
    if (fields.status === 'PAGO' && fields.paidDate === undefined && !existing.paidDate) fields.paidDate = todayISO();
    if (fields.status && fields.status !== 'PAGO') fields.paidDate = null;
    if (applyToGroup) {
      // Edição em lote: aplica descrição/categoria/valor às parcelas/recorrências seguintes ainda não pagas
      const group = existing.installmentGroupId ?? existing.recurringGroupId;
      if (!group) throw new HttpError(400, 'Lançamento não pertence a um grupo');
      const { competenceDate: _c, dueDate: _d, paidDate: _p, status: _s, ...bulk } = fields;
      const { count } = await app.prisma.expense.updateMany({
        where: {
          userId: req.userId, status: 'PENDENTE', competenceDate: { gte: existing.competenceDate },
          OR: [{ installmentGroupId: group }, { recurringGroupId: group }],
        },
        data: toData(bulk) as never,
      });
      await audit(app, req, 'BULK', 'Expense', id, { count, fields: Object.keys(bulk) });
      return { updated: count };
    }
    const row = await app.prisma.expense.update({ where: { id }, data: toData(fields) as never, include });
    await audit(app, req, 'UPDATE', 'Expense', id, { fields: Object.keys(fields) });
    return serialize(row);
  });

  app.delete('/expenses/:id', async (req) => {
    const { id } = req.params as { id: string };
    const q = parse(z.object({ group: z.enum(['true', 'false']).optional() }), req.query);
    const existing = await app.prisma.expense.findFirst({ where: { id, userId: req.userId } });
    if (!existing) throw notFound('Despesa');
    const group = existing.installmentGroupId ?? existing.recurringGroupId;
    let count = 1;
    if (q.group === 'true' && group) {
      ({ count } = await app.prisma.expense.deleteMany({
        where: { userId: req.userId, status: { not: 'PAGO' }, competenceDate: { gte: existing.competenceDate }, OR: [{ installmentGroupId: group }, { recurringGroupId: group }] },
      }));
    } else {
      await app.prisma.expense.delete({ where: { id } });
    }
    await audit(app, req, 'DELETE', 'Expense', id, { count });
    return { ok: true, removed: count };
  });

  // ---------- Faturas de cartão ----------
  app.put('/card-invoices', async (req) => {
    const b = parse(z.object({ cardId: zId, reference: zYearMonth, paidDate: zDate, amount: zPositiveMoney }), req.body);
    await assertOwned(app.prisma, 'creditCard', b.cardId, req.userId);
    const row = await app.prisma.cardInvoicePayment.upsert({
      where: { cardId_reference: { cardId: b.cardId, reference: b.reference } },
      create: { userId: req.userId, cardId: b.cardId, reference: b.reference, paidDate: toDate(b.paidDate), amount: b.amount },
      update: { paidDate: toDate(b.paidDate), amount: b.amount },
    });
    await audit(app, req, 'UPDATE', 'CardInvoicePayment', row.id, { reference: b.reference });
    return serialize(row);
  });

  app.delete('/card-invoices', async (req) => {
    const b = parse(z.object({ cardId: zId, reference: zYearMonth }), req.query);
    await assertOwned(app.prisma, 'creditCard', b.cardId, req.userId);
    await app.prisma.cardInvoicePayment.deleteMany({ where: { cardId: b.cardId, reference: b.reference, userId: req.userId } });
    await audit(app, req, 'DELETE', 'CardInvoicePayment', null, { reference: b.reference });
    return { ok: true };
  });
}
