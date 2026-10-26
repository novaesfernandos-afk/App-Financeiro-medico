import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import type { Env } from './env';
import './lib/context';
import { requireAuth } from './lib/auth';
import { errorHandler } from './lib/http';
import { authRoutes } from './routes/auth';
import { contractRoutes } from './routes/contracts';
import { expenseRoutes } from './routes/expenses';
import { financeRoutes } from './routes/finance';
import { incomeRoutes } from './routes/incomes';
import { privacyRoutes } from './routes/privacy';
import { settingsRoutes } from './routes/settings';
import { shiftRoutes } from './routes/shifts';
import { taxRoutes } from './routes/taxes';

export async function buildApp(env: Env, prisma = new PrismaClient()) {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Nunca registrar cookies/credenciais em log
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  app.decorate('prisma', prisma);
  app.decorate('env', env);
  app.decorateRequest('userId', '');
  app.setErrorHandler(errorHandler);
  app.addHook('onClose', async () => prisma.$disconnect());

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', global: true });

  app.get('/api/health', async () => ({ status: 'ok' }));

  await app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(async (priv) => {
      priv.addHook('preHandler', requireAuth(app));
      await priv.register(settingsRoutes);
      await priv.register(taxRoutes);
      await priv.register(contractRoutes);
      await priv.register(shiftRoutes);
      await priv.register(incomeRoutes);
      await priv.register(expenseRoutes);
      await priv.register(financeRoutes);
      await priv.register(privacyRoutes);
    });
  }, { prefix: '/api' });

  return app;
}
