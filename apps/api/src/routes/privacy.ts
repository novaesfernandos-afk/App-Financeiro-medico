import { verify } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { destroySession } from '../lib/auth';
import { HttpError, parse, serialize } from '../lib/http';

/** Skill `privacy-guardian` (LGPD): portabilidade, eliminação e transparência. */
export async function privacyRoutes(app: FastifyInstance) {
  app.get('/privacy/export', async (req, reply) => {
    const userId = req.userId;
    const where = { userId };
    const [user, institutions, companies, taxProfiles, contracts, shiftRates, shiftSeries, shifts, salaryPayments, incomes,
      expenseCategories, expenses, creditCards, cardInvoicePayments, bankAccounts, goals, auditLogs] = await Promise.all([
      app.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } }),
      app.prisma.institution.findMany({ where }), app.prisma.company.findMany({ where }),
      app.prisma.taxProfile.findMany({ where, include: { versions: true } }),
      app.prisma.contract.findMany({ where, include: { adjustments: true } }),
      app.prisma.shiftRate.findMany({ where }), app.prisma.shiftSeries.findMany({ where }), app.prisma.shift.findMany({ where }),
      app.prisma.salaryPayment.findMany({ where }), app.prisma.income.findMany({ where }),
      app.prisma.expenseCategory.findMany({ where }), app.prisma.expense.findMany({ where }),
      app.prisma.creditCard.findMany({ where }), app.prisma.cardInvoicePayment.findMany({ where }),
      app.prisma.bankAccount.findMany({ where }), app.prisma.goal.findMany({ where }),
      app.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 }),
    ]);
    await audit(app, req, 'EXPORT', 'User', userId);
    reply.header('Content-Disposition', `attachment; filename="medfinance-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return serialize({
      exportedAt: new Date().toISOString(),
      format: 'medfinance-export/v1',
      user, institutions, companies, taxProfiles, contracts, shiftRates, shiftSeries, shifts, salaryPayments, incomes,
      expenseCategories, expenses, creditCards, cardInvoicePayments, bankAccounts, goals, auditLogs,
    });
  });

  /** Exclusão definitiva da conta e de todos os dados (cascade). Exige senha + confirmação textual. */
  app.post('/privacy/delete-account', async (req, reply) => {
    const b = parse(z.object({ password: z.string(), confirmation: z.literal('EXCLUIR MINHA CONTA') }), req.body);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
    if (!(await verify(user.passwordHash, b.password))) throw new HttpError(401, 'Senha incorreta');
    await app.prisma.user.delete({ where: { id: user.id } });
    await destroySession(app, req, reply);
    return { ok: true };
  });

  app.get('/audit', async (req) => {
    const q = parse(z.object({ take: z.coerce.number().int().min(1).max(500).default(100) }), req.query);
    return serialize(await app.prisma.auditLog.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' }, take: q.take }));
  });
}
