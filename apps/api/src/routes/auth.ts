import { hash, verify } from '@node-rs/argon2';
import { DEFAULT_EXPENSE_CATEGORIES } from '@medfinance/core';
import type { FastifyInstance } from 'fastify';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { createSession, destroySession, requireAuth } from '../lib/auth';
import { decrypt, encrypt } from '../lib/crypto';
import { HttpError, parse } from '../lib/http';

authenticator.options = { window: 1 };

const password = z.string().min(10, 'Senha deve ter ao menos 10 caracteres').max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Senha deve conter letras e números');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/auth/register', authLimit, async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const exists = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new HttpError(409, 'E-mail já cadastrado');
    const user = await app.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hash(body.password),
        profile: { create: {} },
        expenseCategories: {
          create: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ name: c.name, scope: c.scope, color: c.color, isTax: c.isTax ?? false })),
        },
      },
    });
    await createSession(app, req, reply, user.id);
    req.userId = user.id;
    await audit(app, req, 'CREATE', 'User', user.id);
    return reply.status(201).send({ id: user.id, name: user.name, email: user.email, mfaEnabled: false, onboardingDone: false });
  });

  app.post('/auth/login', authLimit, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = await app.prisma.user.findUnique({ where: { email: body.email }, include: { profile: true } });
    // Mesma mensagem para e-mail inexistente e senha errada (evita enumeração)
    if (!user || !(await verify(user.passwordHash, body.password))) throw new HttpError(401, 'E-mail ou senha incorretos');
    if (user.mfaEnabled) {
      if (!body.mfaCode) return reply.status(401).send({ error: 'Código MFA necessário', mfaRequired: true });
      const secret = decrypt(user.mfaSecretEnc!, app.env.ENCRYPTION_KEY);
      if (!authenticator.check(body.mfaCode, secret)) throw new HttpError(401, 'Código MFA inválido');
    }
    await createSession(app, req, reply, user.id);
    req.userId = user.id;
    await audit(app, req, 'LOGIN', 'User', user.id);
    return { id: user.id, name: user.name, email: user.email, mfaEnabled: user.mfaEnabled, onboardingDone: user.profile?.onboardingDone ?? false };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(app, req, reply);
    return { ok: true };
  });

  app.register(async (priv) => {
    priv.addHook('preHandler', requireAuth(app));

    priv.get('/auth/me', async (req) => {
      const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId }, include: { profile: true } });
      return { id: user.id, name: user.name, email: user.email, mfaEnabled: user.mfaEnabled, onboardingDone: user.profile?.onboardingDone ?? false, theme: user.profile?.theme ?? 'dark' };
    });

    priv.post('/auth/mfa/setup', async (req) => {
      const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
      if (user.mfaEnabled) throw new HttpError(409, 'MFA já está ativo');
      const secret = authenticator.generateSecret();
      await app.prisma.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encrypt(secret, app.env.ENCRYPTION_KEY) } });
      return { secret, otpauthUrl: authenticator.keyuri(user.email, 'MedFinance AI', secret) };
    });

    priv.post('/auth/mfa/enable', async (req) => {
      const { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
      const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
      if (!user.mfaSecretEnc) throw new HttpError(400, 'Inicie a configuração do MFA primeiro');
      if (!authenticator.check(code, decrypt(user.mfaSecretEnc, app.env.ENCRYPTION_KEY))) throw new HttpError(400, 'Código inválido');
      await app.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      await audit(app, req, 'MFA_ENABLE', 'User', user.id);
      return { mfaEnabled: true };
    });

    priv.post('/auth/mfa/disable', async (req) => {
      const body = parse(z.object({ password: z.string(), code: z.string().regex(/^\d{6}$/) }), req.body);
      const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
      if (!user.mfaEnabled || !user.mfaSecretEnc) throw new HttpError(400, 'MFA não está ativo');
      if (!(await verify(user.passwordHash, body.password))) throw new HttpError(401, 'Senha incorreta');
      if (!authenticator.check(body.code, decrypt(user.mfaSecretEnc, app.env.ENCRYPTION_KEY))) throw new HttpError(400, 'Código inválido');
      await app.prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecretEnc: null } });
      await audit(app, req, 'MFA_DISABLE', 'User', user.id);
      return { mfaEnabled: false };
    });

    priv.post('/auth/password', async (req) => {
      const body = parse(z.object({ currentPassword: z.string(), newPassword: password }), req.body);
      const user = await app.prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
      if (!(await verify(user.passwordHash, body.currentPassword))) throw new HttpError(401, 'Senha atual incorreta');
      await app.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(body.newPassword) } });
      await audit(app, req, 'UPDATE', 'User.password', user.id);
      return { ok: true };
    });
  });
}
