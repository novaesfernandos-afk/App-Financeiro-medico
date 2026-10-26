import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { clean, registerCrud } from '../lib/crud';
import { parse, serialize, toDate, zDate, zId, zPercent, zPositiveMoney, zMoney, zTime } from '../lib/http';
import { assertOwned } from '../lib/ownership';

const paymentRule = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('DAYS_AFTER'), days: z.number().int().min(0).max(365) }),
  z.object({ mode: z.literal('MONTH_DAY'), day: z.number().int().min(1).max(31), monthsAfter: z.number().int().min(0).max(12) }),
]);
export const zPaymentRule = paymentRule;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export async function settingsRoutes(app: FastifyInstance) {
  // ---------- Perfil ----------
  const profileSchema = z.object({
    name: z.string().trim().min(2).max(120),
    specialty: z.string().trim().max(120).nullable(),
    crm: z.string().trim().max(40).nullable(),
    estimatedMonthlyIncome: zPositiveMoney.nullable(),
    emergencyReserveTarget: zPositiveMoney.nullable(),
    declaredNetWorth: zMoney.nullable(),
    declaredInvestments: zPositiveMoney.nullable(),
    onboardingDone: z.boolean(),
    theme: z.enum(['dark', 'light', 'system']),
  }).partial();

  app.get('/profile', async (req) => {
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId }, include: { profile: true } });
    return serialize({ name: user.name, email: user.email, mfaEnabled: user.mfaEnabled, ...user.profile });
  });

  app.patch('/profile', async (req) => {
    const { name, ...rest } = parse(profileSchema, req.body);
    if (name) await app.prisma.user.update({ where: { id: req.userId }, data: { name } });
    const profile = await app.prisma.profile.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...clean(rest) },
      update: clean(rest),
    });
    await audit(app, req, 'UPDATE', 'Profile', req.userId, { fields: Object.keys(rest) });
    return serialize(profile);
  });

  // ---------- Instituições ----------
  registerCrud(app, {
    path: '/institutions', model: 'institution', entity: 'Institution', softDelete: true,
    orderBy: { name: 'asc' },
    schema: z.object({
      name: z.string().trim().min(1).max(160),
      kind: z.enum(['HOSPITAL', 'CLINICA', 'UNIVERSIDADE', 'TELEMEDICINA', 'OPERADORA', 'OUTRO']).default('HOSPITAL'),
      color: color.optional(),
      paymentRule: paymentRule.nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
      archived: z.boolean().optional(),
    }),
    toData: (b) => clean({ ...b, paymentRule: b.paymentRule === null ? null : b.paymentRule }),
  });

  // ---------- Empresas (PJ médica) ----------
  registerCrud(app, {
    path: '/companies', model: 'company', entity: 'Company', orderBy: { name: 'asc' },
    schema: z.object({
      name: z.string().trim().min(1).max(160),
      cnpj: z.string().trim().regex(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, 'CNPJ inválido').nullable().optional(),
      taxRegime: z.enum(['SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'NAO_INFORMADO']).default('NAO_INFORMADO'),
      accountingFee: zPositiveMoney.nullable().optional(),
    }),
    toData: (b) => clean(b),
  });

  // ---------- Contas bancárias ----------
  registerCrud(app, {
    path: '/accounts', model: 'bankAccount', entity: 'BankAccount', softDelete: true, orderBy: { name: 'asc' },
    schema: z.object({
      name: z.string().trim().min(1).max(120),
      bank: z.string().trim().max(120).nullable().optional(),
      kind: z.enum(['CORRENTE', 'POUPANCA', 'PAGAMENTO', 'INVESTIMENTO', 'OUTRA']).default('CORRENTE'),
      initialBalance: zMoney,
      initialBalanceDate: zDate,
      archived: z.boolean().optional(),
    }),
    toData: (b) => clean({ ...b, initialBalanceDate: b.initialBalanceDate ? toDate(b.initialBalanceDate as string) : undefined }),
  });

  // ---------- Cartões ----------
  registerCrud(app, {
    path: '/cards', model: 'creditCard', entity: 'CreditCard', softDelete: true, orderBy: { name: 'asc' },
    schema: z.object({
      name: z.string().trim().min(1).max(120),
      brand: z.string().trim().max(60).nullable().optional(),
      closingDay: z.number().int().min(1).max(31),
      dueDay: z.number().int().min(1).max(31),
      limit: zPositiveMoney.nullable().optional(),
      archived: z.boolean().optional(),
    }),
    toData: (b) => clean(b),
  });

  // ---------- Categorias de despesa ----------
  registerCrud(app, {
    path: '/expense-categories', model: 'expenseCategory', entity: 'ExpenseCategory', softDelete: true,
    orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    schema: z.object({
      name: z.string().trim().min(1).max(80),
      scope: z.enum(['PESSOAL', 'PROFISSIONAL']),
      color: color.optional(),
      isTax: z.boolean().optional(),
      monthlyBudget: zPositiveMoney.nullable().optional(),
      archived: z.boolean().optional(),
    }),
    toData: (b) => clean(b),
  });

  // ---------- Metas ----------
  registerCrud(app, {
    path: '/goals', model: 'goal', entity: 'Goal', orderBy: { createdAt: 'asc' },
    schema: z.object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(['RESERVA_EMERGENCIA', 'PATRIMONIO', 'APOSENTADORIA', 'COMPRA', 'OUTRA']).default('OUTRA'),
      targetAmount: zPositiveMoney,
      currentAmount: zPositiveMoney.optional(),
      targetDate: zDate.nullable().optional(),
    }),
    toData: (b) => clean({ ...b, targetDate: b.targetDate ? toDate(b.targetDate as string) : b.targetDate === null ? null : undefined }),
  });

  // ---------- Valores de plantão por instituição ----------
  registerCrud(app, {
    path: '/shift-rates', model: 'shiftRate', entity: 'ShiftRate', orderBy: [{ institutionId: 'asc' }, { shiftType: 'asc' }],
    schema: z.object({
      institutionId: zId,
      contractId: zId.nullable().optional(),
      shiftType: z.enum(['DIURNO', 'NOTURNO', 'FIM_DE_SEMANA', 'FERIADO', 'SOBREAVISO']),
      weekday: z.number().int().min(0).max(6).nullable().optional(),
      pricingMode: z.enum(['PER_SHIFT', 'PER_HOUR']).default('PER_SHIFT'),
      amount: zPositiveMoney,
      additionalPercent: zPercent.nullable().optional(),
      defaultStart: zTime.optional(),
      defaultEnd: zTime.optional(),
    }),
    toData: async (b, userId) => {
      await assertOwned(app.prisma, 'institution', b.institutionId as string, userId);
      await assertOwned(app.prisma, 'contract', b.contractId as string, userId);
      return clean(b);
    },
  });
}
