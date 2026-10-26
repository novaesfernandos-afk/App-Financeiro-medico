import { addDays, resolveTax, TAX_CODES, TaxValidationError, validateVersions, type TaxRuleVersion } from '@medfinance/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean } from '../lib/crud';
import { fromDate, HttpError, notFound, parse, serialize, toDate, zDate, zId, zMoney, zPercent } from '../lib/http';
import { assertOwned } from '../lib/ownership';
import { toTaxProfile } from '../services/mappers';

export const zTaxComponent = z.object({
  code: z.enum(TAX_CODES),
  label: z.string().trim().max(60).optional(),
  kind: z.enum(['PERCENT', 'FIXED', 'PROGRESSIVE']),
  rate: zPercent.optional(),
  amount: zMoney.optional(),
  brackets: z.array(z.object({ upTo: zMoney.nullable(), rate: zPercent, deduction: zMoney.optional() })).max(10).optional(),
  base: z.enum(['GROSS', 'GROSS_MINUS_PREVIOUS']).optional(),
  withheldAtSource: z.boolean().optional(),
}).superRefine((c, ctx) => {
  if (c.kind === 'PERCENT' && c.rate === undefined) ctx.addIssue({ code: 'custom', message: 'Informe a alíquota' });
  if (c.kind === 'FIXED' && c.amount === undefined) ctx.addIssue({ code: 'custom', message: 'Informe o valor fixo' });
  if (c.kind === 'PROGRESSIVE' && !c.brackets?.length) ctx.addIssue({ code: 'custom', message: 'Informe as faixas' });
});

const versionSchema = z.object({
  validFrom: zDate,
  validTo: zDate.nullable().optional(),
  components: z.array(zTaxComponent).max(15),
  confidence: z.enum(['ESTIMATED', 'CONFIRMED']).default('ESTIMATED'),
  legalReference: z.string().trim().max(300).nullable().optional(),
  source: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.enum(['PF', 'PJ', 'CLT', 'OUTRO']),
  companyId: zId.nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

type VersionBody = z.infer<typeof versionSchema>;

function asCoreVersions(rows: { id: string; validFrom: Date; validTo: Date | null; components: unknown; confidence: string }[]): TaxRuleVersion[] {
  return rows.map((v) => ({
    id: v.id, validFrom: fromDate(v.validFrom)!, validTo: fromDate(v.validTo), components: v.components as TaxRuleVersion['components'],
    confidence: v.confidence as TaxRuleVersion['confidence'],
  }));
}

function checkVersions(versions: TaxRuleVersion[]) {
  try {
    validateVersions(versions);
  } catch (e) {
    if (e instanceof TaxValidationError) throw new HttpError(400, e.message);
    throw e;
  }
}

const versionData = (v: Partial<VersionBody>) => clean({
  ...v,
  validFrom: v.validFrom ? toDate(v.validFrom) : undefined,
  validTo: v.validTo ? toDate(v.validTo) : v.validTo === null ? null : undefined,
  components: v.components as never,
});

export async function taxRoutes(app: FastifyInstance) {
  const include = { versions: { orderBy: { validFrom: 'desc' as const } }, company: { select: { id: true, name: true, taxRegime: true } } };

  async function ownedProfile(id: string, userId: string) {
    const p = await app.prisma.taxProfile.findFirst({ where: { id, userId }, include });
    if (!p) throw notFound('Perfil tributário');
    return p;
  }

  app.get('/tax-profiles', async (req) =>
    serialize(await app.prisma.taxProfile.findMany({ where: { userId: req.userId }, include, orderBy: { name: 'asc' } })));

  app.post('/tax-profiles', async (req, reply) => {
    const body = parse(profileSchema.extend({ version: versionSchema.optional() }), req.body);
    await assertOwned(app.prisma, 'company', body.companyId, req.userId);
    if (body.version) checkVersions([{ ...body.version, validTo: body.version.validTo ?? null }]);
    const { version, ...profile } = body;
    const row = await app.prisma.taxProfile.create({
      data: { ...clean(profile), userId: req.userId, versions: version ? { create: versionData(version) as never } : undefined } as never,
      include,
    });
    await audit(app, req, 'CREATE', 'TaxProfile', row.id);
    return reply.status(201).send(serialize(row));
  });

  app.patch('/tax-profiles/:id', async (req) => {
    const { id } = req.params as { id: string };
    await ownedProfile(id, req.userId);
    const body = parse(profileSchema.partial(), req.body);
    await assertOwned(app.prisma, 'company', body.companyId, req.userId);
    const row = await app.prisma.taxProfile.update({ where: { id }, data: clean(body), include });
    await audit(app, req, 'UPDATE', 'TaxProfile', id);
    return serialize(row);
  });

  app.delete('/tax-profiles/:id', async (req) => {
    const { id } = req.params as { id: string };
    await ownedProfile(id, req.userId);
    const inUse = await app.prisma.shift.count({ where: { userId: req.userId, taxProfileId: id } })
      + await app.prisma.income.count({ where: { userId: req.userId, taxProfileId: id } });
    if (inUse > 0) throw new HttpError(409, `Perfil usado em ${inUse} lançamento(s). Crie uma nova vigência em vez de excluir.`);
    await app.prisma.taxProfile.delete({ where: { id } });
    await audit(app, req, 'DELETE', 'TaxProfile', id);
    return { ok: true };
  });

  /** Nova vigência. Se houver vigência aberta anterior, ela é encerrada na véspera. */
  app.post('/tax-profiles/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = await ownedProfile(id, req.userId);
    const body = parse(versionSchema, req.body);
    const existing = asCoreVersions(profile.versions);
    const toClose = existing.find((v) => !v.validTo && v.validFrom < body.validFrom);
    if (toClose) toClose.validTo = addDays(body.validFrom, -1);
    checkVersions([...existing, { ...body, validTo: body.validTo ?? null }]);
    await app.prisma.$transaction(async (tx) => {
      if (toClose) await tx.taxProfileVersion.update({ where: { id: toClose.id! }, data: { validTo: toDate(toClose.validTo!) } });
      await tx.taxProfileVersion.create({ data: { ...(versionData(body) as object), taxProfileId: id } as never });
    });
    await audit(app, req, 'CREATE', 'TaxProfileVersion', id, { validFrom: body.validFrom });
    return reply.status(201).send(serialize(await ownedProfile(id, req.userId)));
  });

  app.patch('/tax-profiles/:id/versions/:versionId', async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const profile = await ownedProfile(id, req.userId);
    if (!profile.versions.some((v) => v.id === versionId)) throw notFound('Vigência');
    const body = parse(versionSchema.partial(), req.body);
    const merged = asCoreVersions(profile.versions).map((v) =>
      v.id === versionId ? { ...v, ...clean(body), validTo: body.validTo !== undefined ? body.validTo : v.validTo } as TaxRuleVersion : v);
    checkVersions(merged);
    await app.prisma.taxProfileVersion.update({ where: { id: versionId }, data: versionData(body) as never });
    await audit(app, req, 'UPDATE', 'TaxProfileVersion', versionId);
    return serialize(await ownedProfile(id, req.userId));
  });

  app.delete('/tax-profiles/:id/versions/:versionId', async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const profile = await ownedProfile(id, req.userId);
    if (!profile.versions.some((v) => v.id === versionId)) throw notFound('Vigência');
    await app.prisma.taxProfileVersion.delete({ where: { id: versionId } });
    await audit(app, req, 'DELETE', 'TaxProfileVersion', versionId);
    return serialize(await ownedProfile(id, req.userId));
  });

  /** Simulação tributária (não persiste nada). */
  app.post('/tax/simulate', async (req) => {
    const body = parse(z.object({
      gross: zMoney,
      date: zDate,
      taxProfileId: zId.optional(),
      components: z.array(zTaxComponent).max(15).optional(),
    }), req.body);
    let profile = null;
    if (body.taxProfileId) profile = toTaxProfile(await ownedProfile(body.taxProfileId, req.userId));
    return resolveTax({ gross: body.gross, date: body.date, profile, override: body.components });
  });
}
