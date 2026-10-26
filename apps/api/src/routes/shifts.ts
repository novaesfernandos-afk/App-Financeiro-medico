import {
  buildLedger, computeShiftValues, expandRecurrence, expectedPaymentDate, RecurrenceError, resolveShiftRate,
  SHIFT_STATUSES, SHIFT_TYPES, shiftDurationMinutes, todayISO, type ShiftRate,
} from '@medfinance/core';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean } from '../lib/crud';
import { dec, HttpError, notFound, parse, serialize, toDate, zDate, zId, zPercent, zPositiveMoney, zTime } from '../lib/http';
import { assertOwned } from '../lib/ownership';
import { asPaymentRule, toShiftRecord, toTaxProfile } from '../services/mappers';
import { zTaxComponent } from './taxes';

const shiftFields = {
  institutionId: zId,
  contractId: zId.nullable().optional(),
  unit: z.string().trim().max(120).nullable().optional(),
  label: z.string().trim().max(120).nullable().optional(),
  date: zDate,
  startTime: zTime.optional(),
  endTime: zTime.optional(),
  type: z.enum(SHIFT_TYPES),
  status: z.enum(SHIFT_STATUSES).optional(),
  pricingMode: z.enum(['PER_SHIFT', 'PER_HOUR']).optional(),
  amount: zPositiveMoney.optional(),
  additionalPercent: zPercent.nullable().optional(),
  bonuses: zPositiveMoney.nullable().optional(),
  deductions: zPositiveMoney.nullable().optional(),
  taxProfileId: zId.nullable().optional(),
  taxOverride: z.array(zTaxComponent).max(15).nullable().optional(),
  confirmedTax: zPositiveMoney.nullable().optional(),
  expectedPaymentDate: zDate.optional(),
  receivedDate: zDate.nullable().optional(),
  receivedAmount: zPositiveMoney.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
};
const shiftSchema = z.object({ ...shiftFields, allowDuplicate: z.boolean().optional() });
type ShiftBody = z.infer<typeof shiftSchema>;

const recurrenceSchema = z.object({
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'EVERY_N_DAYS', 'MONTHLY']),
  startDate: zDate,
  until: zDate,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  interval: z.number().int().min(1).max(60).optional(),
  monthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
  exceptions: z.array(zDate).max(200).optional(),
});

export async function shiftRoutes(app: FastifyInstance) {
  /** Completa valores ausentes com a tabela de valores e regras de pagamento do vínculo/instituição. */
  async function resolveDefaults(b: Partial<ShiftBody> & { institutionId: string; date: string; type: ShiftBody['type'] }, userId: string) {
    const [institution, contract] = await Promise.all([
      app.prisma.institution.findFirst({ where: { id: b.institutionId, userId } }),
      b.contractId ? app.prisma.contract.findFirst({ where: { id: b.contractId, userId } }) : null,
    ]);
    if (!institution) throw notFound('Instituição');
    if (b.contractId && !contract) throw notFound('Vínculo');
    if (contract && contract.institutionId !== institution.id) throw new HttpError(400, 'Vínculo não pertence à instituição informada');
    await assertOwned(app.prisma, 'taxProfile', b.taxProfileId, userId);

    const rates = await app.prisma.shiftRate.findMany({ where: { userId, institutionId: institution.id } });
    const toCore = (r: typeof rates[number]): ShiftRate => ({
      shiftType: r.shiftType, weekday: r.weekday, pricingMode: r.pricingMode, amount: dec(r.amount)!, additionalPercent: r.additionalPercent?.toString() ?? null,
    });
    const contractRates = rates.filter((r) => contract && r.contractId === contract.id);
    const generalRates = rates.filter((r) => !r.contractId);
    const rate = resolveShiftRate(contractRates.map(toCore), b.type, b.date) ?? resolveShiftRate(generalRates.map(toCore), b.type, b.date);
    const rateRow = rate ? rates.find((r) => r.shiftType === rate.shiftType && r.weekday === rate.weekday && dec(r.amount) === rate.amount) : null;

    const amount = b.amount ?? rate?.amount;
    if (amount === undefined) throw new HttpError(400, 'Informe o valor do plantão ou cadastre a tabela de valores da instituição');
    const rule = asPaymentRule(contract?.shiftPaymentRule) ?? asPaymentRule(institution.paymentRule);
    return {
      startTime: b.startTime ?? rateRow?.defaultStart ?? (b.type === 'NOTURNO' ? '19:00' : '07:00'),
      endTime: b.endTime ?? rateRow?.defaultEnd ?? (b.type === 'NOTURNO' ? '07:00' : '19:00'),
      pricingMode: b.pricingMode ?? rate?.pricingMode ?? 'PER_SHIFT',
      amount,
      additionalPercent: b.additionalPercent !== undefined ? b.additionalPercent : rate?.additionalPercent ?? null,
      expectedPaymentDate: b.expectedPaymentDate ?? expectedPaymentDate(b.date, rule),
    };
  }

  function toData(b: Partial<ShiftBody>) {
    const { allowDuplicate: _ignored, ...rest } = b;
    return clean({
      ...rest,
      date: rest.date ? toDate(rest.date) : undefined,
      expectedPaymentDate: rest.expectedPaymentDate ? toDate(rest.expectedPaymentDate) : undefined,
      receivedDate: rest.receivedDate ? toDate(rest.receivedDate) : rest.receivedDate === null ? null : undefined,
      taxOverride: rest.taxOverride === null ? undefined : (rest.taxOverride as never),
    });
  }

  /** Enriquece plantões com valores calculados pelo núcleo financeiro (mesma lógica do dashboard). */
  async function withValues(userId: string, shifts: Prisma.ShiftGetPayload<{ include: { institution: true; contract: true } }>[]) {
    const profiles = await app.prisma.taxProfile.findMany({ where: { userId }, include: { versions: true } });
    const today = todayISO();
    const ledger = buildLedger({
      from: today, to: today, today, contracts: [], salaryPayments: [], incomes: [], expenses: [], cards: [], invoicePayments: [],
      taxProfiles: Object.fromEntries(profiles.map((p) => [p.id, toTaxProfile(p)])),
      shifts: shifts.map((s) => toShiftRecord(s, s.contract)),
    });
    const byId = new Map(ledger.map((i) => [i.refId, i]));
    return shifts.map((s) => {
      const v = byId.get(s.id)!;
      return {
        ...(serialize(s) as object),
        institution: { id: s.institution.id, name: s.institution.name, color: s.institution.color },
        contract: s.contract ? { id: s.contract.id, title: s.contract.title, type: s.contract.type } : null,
        computed: {
          effectiveStatus: v.recordStatus, hours: v.hours, gross: v.gross, tax: v.tax, taxStatus: v.taxStatus,
          deductions: v.deductions, net: v.net, certainty: v.certainty, cashStatus: v.cashStatus, trace: v.trace,
        },
      };
    });
  }

  const include = { institution: true, contract: true } as const;

  app.get('/shifts', async (req) => {
    const q = parse(z.object({ from: zDate, to: zDate, institutionId: zId.optional(), status: z.enum(SHIFT_STATUSES).optional() }), req.query);
    const shifts = await app.prisma.shift.findMany({
      where: { userId: req.userId, date: { gte: toDate(q.from), lte: toDate(q.to) }, institutionId: q.institutionId, status: q.status },
      include,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return withValues(req.userId, shifts);
  });

  /** Pré-visualização do cálculo (não persiste). */
  app.post('/shifts/preview', async (req) => {
    const b = parse(shiftSchema, req.body);
    const d = await resolveDefaults(b, req.userId);
    const contract = b.contractId ? await app.prisma.contract.findFirst({ where: { id: b.contractId, userId: req.userId } }) : null;
    const profileId = b.taxProfileId ?? contract?.taxProfileId;
    const profile = profileId ? await app.prisma.taxProfile.findFirst({ where: { id: profileId, userId: req.userId }, include: { versions: true } }) : null;
    return {
      ...d,
      values: computeShiftValues({
        date: b.date, durationMinutes: shiftDurationMinutes(d.startTime, d.endTime), pricingMode: d.pricingMode, amount: d.amount,
        additionalPercent: d.additionalPercent, bonuses: b.bonuses, deductions: b.deductions,
        taxProfile: profile ? toTaxProfile(profile) : null, taxOverride: b.taxOverride, confirmedTax: b.confirmedTax,
      }),
    };
  });

  app.post('/shifts', async (req, reply) => {
    const b = parse(shiftSchema, req.body);
    const d = await resolveDefaults(b, req.userId);
    if (!b.allowDuplicate) {
      const dup = await app.prisma.shift.findFirst({
        where: { userId: req.userId, institutionId: b.institutionId, date: toDate(b.date), startTime: d.startTime, status: { not: 'CANCELADO' } },
      });
      if (dup) throw new HttpError(409, 'Já existe um plantão nesta instituição, data e horário. Confirme para registrar mesmo assim.', { duplicateId: dup.id });
    }
    const row = await app.prisma.shift.create({
      data: { ...(toData({ ...b, ...d }) as object), userId: req.userId } as never,
      include,
    });
    await audit(app, req, 'CREATE', 'Shift', row.id);
    return reply.status(201).send((await withValues(req.userId, [row]))[0]);
  });

  app.patch('/shifts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const existing = await app.prisma.shift.findFirst({ where: { id, userId: req.userId } });
    if (!existing) throw notFound('Plantão');
    const b = parse(shiftSchema.partial(), req.body);
    await assertOwned(app.prisma, 'institution', b.institutionId, req.userId);
    await assertOwned(app.prisma, 'contract', b.contractId, req.userId);
    await assertOwned(app.prisma, 'taxProfile', b.taxProfileId, req.userId);
    if (b.status === 'RECEBIDO' && !b.receivedDate && !existing.receivedDate) b.receivedDate = todayISO();
    if (b.status && b.status !== 'RECEBIDO') { b.receivedDate ??= null; b.receivedAmount ??= null; }
    const row = await app.prisma.shift.update({ where: { id }, data: toData(b) as never, include });
    await audit(app, req, 'UPDATE', 'Shift', id, { fields: Object.keys(b) });
    return (await withValues(req.userId, [row]))[0];
  });

  app.delete('/shifts/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { count } = await app.prisma.shift.deleteMany({ where: { id, userId: req.userId } });
    if (!count) throw notFound('Plantão');
    await audit(app, req, 'DELETE', 'Shift', id);
    return { ok: true };
  });

  /** Edição em lote de status (ex.: marcar vários plantões como recebidos). Exige confirmação explícita. */
  app.post('/shifts/bulk-status', async (req) => {
    const b = parse(z.object({
      ids: z.array(zId).min(1).max(200),
      status: z.enum(SHIFT_STATUSES),
      receivedDate: zDate.optional(),
      confirm: z.literal(true, { errorMap: () => ({ message: 'Confirmação explícita necessária' }) }),
    }), req.body);
    const data: Prisma.ShiftUpdateManyMutationInput = { status: b.status };
    if (b.status === 'RECEBIDO') data.receivedDate = toDate(b.receivedDate ?? todayISO());
    else { data.receivedDate = null; data.receivedAmount = null; }
    const { count } = await app.prisma.shift.updateMany({ where: { id: { in: b.ids }, userId: req.userId }, data });
    await audit(app, req, 'BULK', 'Shift', null, { count, status: b.status });
    return { updated: count };
  });

  // ---------- Escalas recorrentes ----------
  const seriesSchema = z.object({
    institutionId: zId,
    contractId: zId.nullable().optional(),
    rule: recurrenceSchema,
    template: z.object({
      type: z.enum(SHIFT_TYPES),
      startTime: zTime.optional(),
      endTime: zTime.optional(),
      pricingMode: z.enum(['PER_SHIFT', 'PER_HOUR']).optional(),
      amount: zPositiveMoney.optional(),
      additionalPercent: zPercent.nullable().optional(),
      unit: z.string().max(120).nullable().optional(),
      label: z.string().max(120).nullable().optional(),
      taxProfileId: zId.nullable().optional(),
    }),
  });

  function expand(rule: z.infer<typeof recurrenceSchema>) {
    try {
      return expandRecurrence(rule);
    } catch (e) {
      if (e instanceof RecurrenceError) throw new HttpError(400, e.message);
      throw e;
    }
  }

  async function materialize(seriesId: string, userId: string, s: z.infer<typeof seriesSchema>, dates: string[]) {
    const rows = [];
    for (const date of dates) {
      const d = await resolveDefaults({ ...s.template, institutionId: s.institutionId, contractId: s.contractId, date }, userId);
      rows.push({
        ...(toData({ ...s.template, ...d, date, institutionId: s.institutionId, contractId: s.contractId ?? null, status: 'AGENDADO' }) as object),
        userId, seriesId,
      });
    }
    // skipDuplicates + @@unique([seriesId, date]) => reprocessar a escala nunca duplica plantões
    const { count } = await app.prisma.shift.createMany({ data: rows as never, skipDuplicates: true });
    return count;
  }

  app.post('/shifts/series', async (req, reply) => {
    const b = parse(seriesSchema, req.body);
    const dates = expand(b.rule);
    if (dates.length === 0) throw new HttpError(400, 'A regra não gera nenhuma data');
    await resolveDefaults({ ...b.template, institutionId: b.institutionId, contractId: b.contractId, date: dates[0]! }, req.userId);
    const series = await app.prisma.shiftSeries.create({ data: { userId: req.userId, institutionId: b.institutionId, contractId: b.contractId ?? null, rule: b.rule, template: b.template } });
    const created = await materialize(series.id, req.userId, b, dates);
    await audit(app, req, 'CREATE', 'ShiftSeries', series.id, { created });
    return reply.status(201).send({ seriesId: series.id, created, skipped: dates.length - created });
  });

  app.post('/shifts/series/:id/extend', async (req) => {
    const { id } = req.params as { id: string };
    const series = await app.prisma.shiftSeries.findFirst({ where: { id, userId: req.userId } });
    if (!series) throw notFound('Escala');
    const { until } = parse(z.object({ until: zDate }), req.body);
    const s = parse(seriesSchema, { institutionId: series.institutionId, contractId: series.contractId, rule: { ...(series.rule as object), until }, template: series.template });
    const created = await materialize(series.id, req.userId, s, expand(s.rule));
    await app.prisma.shiftSeries.update({ where: { id }, data: { rule: s.rule } });
    await audit(app, req, 'UPDATE', 'ShiftSeries', id, { until, created });
    return { seriesId: id, created };
  });

  /** Remove plantões AGENDADOS futuros da escala; realizados/recebidos são preservados. */
  app.delete('/shifts/series/:id', async (req) => {
    const { id } = req.params as { id: string };
    const series = await app.prisma.shiftSeries.findFirst({ where: { id, userId: req.userId } });
    if (!series) throw notFound('Escala');
    const { count } = await app.prisma.shift.deleteMany({ where: { seriesId: id, userId: req.userId, status: 'AGENDADO', date: { gte: toDate(todayISO()) } } });
    await audit(app, req, 'DELETE', 'ShiftSeries', id, { removedFuture: count });
    return { removed: count };
  });

  app.get('/shifts/series', async (req) => {
    const rows = await app.prisma.shiftSeries.findMany({ where: { userId: req.userId }, include: { _count: { select: { shifts: true } } }, orderBy: { createdAt: 'desc' } });
    return serialize(rows);
  });
}
