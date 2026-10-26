import { CONTRACT_TYPES, projectSalaryOccurrences, todayISO } from '@medfinance/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean } from '../lib/crud';
import { HttpError, notFound, parse, serialize, toDate, zDate, zId, zPositiveMoney, zYearMonth } from '../lib/http';
import { assertOwned } from '../lib/ownership';
import { toContractInput, toTaxProfile } from '../services/mappers';
import { zPaymentRule } from './settings';

const namedAmount = z.object({ label: z.string().trim().min(1).max(80), amount: zPositiveMoney });

const contractSchema = z.object({
  institutionId: zId,
  companyId: zId.nullable().optional(),
  taxProfileId: zId.nullable().optional(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(CONTRACT_TYPES),
  grossSalary: zPositiveMoney.nullable().optional(),
  additions: z.array(namedAmount).max(20).optional(),
  deductions: z.array(namedAmount).max(20).optional(),
  payDays: z.array(z.number().int().min(1).max(31)).min(1).max(4).optional(),
  payMonthOffset: z.number().int().min(0).max(2).optional(),
  startDate: zDate,
  endDate: zDate.nullable().optional(),
  trackFrom: zDate.optional(),
  shiftPaymentRule: zPaymentRule.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

export async function contractRoutes(app: FastifyInstance) {
  const include = {
    institution: { select: { id: true, name: true, color: true } },
    taxProfile: { select: { id: true, name: true, scope: true } },
    company: { select: { id: true, name: true } },
    adjustments: { orderBy: { effectiveDate: 'asc' as const } },
  };

  async function checkRefs(b: Partial<z.infer<typeof contractSchema>>, userId: string) {
    await assertOwned(app.prisma, 'institution', b.institutionId, userId);
    await assertOwned(app.prisma, 'company', b.companyId, userId);
    await assertOwned(app.prisma, 'taxProfile', b.taxProfileId, userId);
  }

  const toData = (b: Partial<z.infer<typeof contractSchema>>) => clean({
    ...b,
    startDate: b.startDate ? toDate(b.startDate) : undefined,
    endDate: b.endDate ? toDate(b.endDate) : b.endDate === null ? null : undefined,
    trackFrom: b.trackFrom ? toDate(b.trackFrom) : undefined,
    shiftPaymentRule: b.shiftPaymentRule === null ? null : b.shiftPaymentRule,
  });

  app.get('/contracts', async (req) =>
    serialize(await app.prisma.contract.findMany({ where: { userId: req.userId }, include, orderBy: [{ active: 'desc' }, { title: 'asc' }] })));

  app.post('/contracts', async (req, reply) => {
    const body = parse(contractSchema, req.body);
    await checkRefs(body, req.userId);
    if (body.endDate && body.endDate < body.startDate) throw new HttpError(400, 'Término anterior ao início');
    // Por padrão o acompanhamento começa no mês atual (ou no início do contrato, se posterior)
    const currentMonthStart = `${todayISO().slice(0, 7)}-01`;
    const trackFrom = body.trackFrom ?? (body.startDate > currentMonthStart ? body.startDate : currentMonthStart);
    const row = await app.prisma.contract.create({
      data: { ...(toData({ ...body, trackFrom }) as object), userId: req.userId } as never,
      include,
    });
    await audit(app, req, 'CREATE', 'Contract', row.id);
    return reply.status(201).send(serialize(row));
  });

  app.patch('/contracts/:id', async (req) => {
    const { id } = req.params as { id: string };
    await assertOwned(app.prisma, 'contract', id, req.userId);
    const body = parse(contractSchema.partial(), req.body);
    await checkRefs(body, req.userId);
    const row = await app.prisma.contract.update({ where: { id }, data: toData(body) as never, include });
    await audit(app, req, 'UPDATE', 'Contract', id, { fields: Object.keys(body) });
    return serialize(row);
  });

  app.delete('/contracts/:id', async (req) => {
    const { id } = req.params as { id: string };
    await assertOwned(app.prisma, 'contract', id, req.userId);
    const used = await app.prisma.shift.count({ where: { contractId: id } }) + await app.prisma.salaryPayment.count({ where: { contractId: id } });
    if (used > 0) {
      // Preserva histórico: vínculo com lançamentos é apenas desativado
      await app.prisma.contract.update({ where: { id }, data: { active: false, endDate: toDate(todayISO()) } });
      await audit(app, req, 'UPDATE', 'Contract', id, { deactivated: true });
      return { ok: true, deactivated: true };
    }
    await app.prisma.contract.delete({ where: { id } });
    await audit(app, req, 'DELETE', 'Contract', id);
    return { ok: true };
  });

  // ---------- Reajustes ----------
  app.post('/contracts/:id/adjustments', async (req, reply) => {
    const { id } = req.params as { id: string };
    await assertOwned(app.prisma, 'contract', id, req.userId);
    const body = parse(z.object({ effectiveDate: zDate, grossSalary: zPositiveMoney, note: z.string().max(200).optional() }), req.body);
    const row = await app.prisma.salaryAdjustment.create({ data: { contractId: id, effectiveDate: toDate(body.effectiveDate), grossSalary: body.grossSalary, note: body.note } });
    await audit(app, req, 'CREATE', 'SalaryAdjustment', row.id);
    return reply.status(201).send(serialize(row));
  });

  app.delete('/contracts/:id/adjustments/:adjId', async (req) => {
    const { id, adjId } = req.params as { id: string; adjId: string };
    await assertOwned(app.prisma, 'contract', id, req.userId);
    const { count } = await app.prisma.salaryAdjustment.deleteMany({ where: { id: adjId, contractId: id } });
    if (!count) throw notFound('Reajuste');
    await audit(app, req, 'DELETE', 'SalaryAdjustment', adjId);
    return { ok: true };
  });

  /** Prévia dos pagamentos projetados do vínculo. */
  app.get('/contracts/:id/projection', async (req) => {
    const { id } = req.params as { id: string };
    const q = parse(z.object({ from: zYearMonth, to: zYearMonth }), req.query);
    const c = await app.prisma.contract.findFirst({ where: { id, userId: req.userId }, include: { adjustments: true, taxProfile: { include: { versions: true } } } });
    if (!c) throw notFound('Vínculo');
    const input = { ...toContractInput(c), taxProfile: c.taxProfile ? toTaxProfile(c.taxProfile) : null };
    return projectSalaryOccurrences(input, q.from, q.to);
  });

  // ---------- Confirmação de recebimento de salário (competência + parcela) ----------
  const paymentSchema = z.object({
    contractId: zId,
    competence: zYearMonth,
    index: z.number().int().min(0).max(3).default(0),
    status: z.enum(['RECEBIDO', 'CANCELADO']).default('RECEBIDO'),
    receivedDate: zDate.nullable().optional(),
    receivedAmount: zPositiveMoney.nullable().optional(),
    confirmedTax: zPositiveMoney.nullable().optional(),
  });

  app.put('/salary-payments', async (req) => {
    const b = parse(paymentSchema, req.body);
    await assertOwned(app.prisma, 'contract', b.contractId, req.userId);
    if (b.status === 'RECEBIDO' && (!b.receivedDate || !b.receivedAmount)) throw new HttpError(400, 'Informe data e valor recebido');
    const data = {
      status: b.status,
      receivedDate: b.receivedDate ? toDate(b.receivedDate) : null,
      receivedAmount: b.receivedAmount ?? null,
      confirmedTax: b.confirmedTax ?? null,
    };
    // Upsert pela chave única (vínculo, competência, parcela): nunca duplica
    const row = await app.prisma.salaryPayment.upsert({
      where: { contractId_competence_index: { contractId: b.contractId, competence: b.competence, index: b.index } },
      create: { ...data, userId: req.userId, contractId: b.contractId, competence: b.competence, index: b.index },
      update: data,
    });
    await audit(app, req, 'UPDATE', 'SalaryPayment', row.id, { competence: b.competence, status: b.status });
    return serialize(row);
  });

  app.delete('/salary-payments', async (req) => {
    const b = parse(z.object({ contractId: zId, competence: zYearMonth, index: z.coerce.number().int().min(0).max(3).default(0) }), req.query);
    await assertOwned(app.prisma, 'contract', b.contractId, req.userId);
    await app.prisma.salaryPayment.deleteMany({ where: { contractId: b.contractId, competence: b.competence, index: b.index } });
    await audit(app, req, 'DELETE', 'SalaryPayment', null, { contractId: b.contractId, competence: b.competence });
    return { ok: true };
  });
}
