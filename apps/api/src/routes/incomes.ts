import { INCOME_CATEGORIES, todayISO } from '@medfinance/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean } from '../lib/crud';
import { notFound, parse, serialize, toDate, zDate, zId, zPositiveMoney } from '../lib/http';
import { assertOwned } from '../lib/ownership';
import { zTaxComponent } from './taxes';

const incomeSchema = z.object({
  description: z.string().trim().min(1).max(200),
  category: z.enum(INCOME_CATEGORIES),
  institutionId: zId.nullable().optional(),
  contractId: zId.nullable().optional(),
  taxProfileId: zId.nullable().optional(),
  competenceDate: zDate,
  expectedPaymentDate: zDate.optional(),
  grossAmount: zPositiveMoney,
  deductions: zPositiveMoney.nullable().optional(),
  taxOverride: z.array(zTaxComponent).max(15).nullable().optional(),
  confirmedTax: zPositiveMoney.nullable().optional(),
  hours: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d{1,4}(\.\d{1,2})?$/.test(v), 'Horas inválidas').nullable().optional(),
  status: z.enum(['PREVISTO', 'RECEBIDO', 'CANCELADO']).optional(),
  receivedDate: zDate.nullable().optional(),
  receivedAmount: zPositiveMoney.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
type IncomeBody = z.infer<typeof incomeSchema>;

export async function incomeRoutes(app: FastifyInstance) {
  async function checkRefs(b: Partial<IncomeBody>, userId: string) {
    await assertOwned(app.prisma, 'institution', b.institutionId, userId);
    await assertOwned(app.prisma, 'contract', b.contractId, userId);
    await assertOwned(app.prisma, 'taxProfile', b.taxProfileId, userId);
  }
  const toData = (b: Partial<IncomeBody>) => clean({
    ...b,
    competenceDate: b.competenceDate ? toDate(b.competenceDate) : undefined,
    expectedPaymentDate: b.expectedPaymentDate ? toDate(b.expectedPaymentDate) : undefined,
    receivedDate: b.receivedDate ? toDate(b.receivedDate) : b.receivedDate === null ? null : undefined,
    taxOverride: b.taxOverride === null ? undefined : (b.taxOverride as never),
  });
  const include = { institution: { select: { id: true, name: true, color: true } }, contract: { select: { id: true, title: true, type: true } } };

  app.get('/incomes', async (req) => {
    const q = parse(z.object({ from: zDate.optional(), to: zDate.optional() }), req.query);
    return serialize(await app.prisma.income.findMany({
      where: { userId: req.userId, competenceDate: { gte: q.from ? toDate(q.from) : undefined, lte: q.to ? toDate(q.to) : undefined } },
      include, orderBy: { competenceDate: 'desc' },
    }));
  });

  app.post('/incomes', async (req, reply) => {
    const b = parse(incomeSchema, req.body);
    await checkRefs(b, req.userId);
    if (b.status === 'RECEBIDO') {
      b.receivedDate ??= todayISO();
    }
    const row = await app.prisma.income.create({
      data: { ...(toData({ ...b, expectedPaymentDate: b.expectedPaymentDate ?? b.competenceDate }) as object), userId: req.userId } as never,
      include,
    });
    await audit(app, req, 'CREATE', 'Income', row.id);
    return reply.status(201).send(serialize(row));
  });

  app.patch('/incomes/:id', async (req) => {
    const { id } = req.params as { id: string };
    await assertOwned(app.prisma, 'income', id, req.userId);
    const b = parse(incomeSchema.partial(), req.body);
    await checkRefs(b, req.userId);
    if (b.status === 'RECEBIDO' && b.receivedDate === undefined) b.receivedDate = todayISO();
    if (b.status && b.status !== 'RECEBIDO') { b.receivedDate = null; b.receivedAmount = null; }
    const row = await app.prisma.income.update({ where: { id }, data: toData(b) as never, include });
    await audit(app, req, 'UPDATE', 'Income', id, { fields: Object.keys(b) });
    return serialize(row);
  });

  app.delete('/incomes/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { count } = await app.prisma.income.deleteMany({ where: { id, userId: req.userId } });
    if (!count) throw notFound('Receita');
    await audit(app, req, 'DELETE', 'Income', id);
    return { ok: true };
  });

}
