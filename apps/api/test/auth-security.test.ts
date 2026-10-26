import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client, makeApp } from './helpers';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });

describe('autenticação', () => {
  it('registro cria sessão, perfil e categorias padrão', async () => {
    const c = await Client.registered(app);
    const me = await c.get('/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.data.onboardingDone).toBe(false);
    const cats = await c.get('/expense-categories');
    expect(cats.data.length).toBeGreaterThan(20);
    expect(cats.data.some((x: any) => x.isTax)).toBe(true);
  });

  it('rejeita senha fraca, e-mail duplicado e credenciais erradas', async () => {
    const c = new Client(app);
    expect((await c.post('/auth/register', { name: 'X Y', email: 'fraca@t.com', password: '123' })).statusCode).toBe(400);
    const a = await Client.registered(app);
    expect((await new Client(app).post('/auth/register', { name: 'Outro', email: a.email, password: 'SenhaForte123' })).statusCode).toBe(409);
    const bad = await new Client(app).post('/auth/login', { email: a.email, password: 'errada000000' });
    expect(bad.statusCode).toBe(401);
  });

  it('rotas privadas exigem sessão; logout invalida', async () => {
    expect((await new Client(app).get('/dashboard?month=2025-10')).statusCode).toBe(401);
    const c = await Client.registered(app);
    const cookie = c.cookie;
    await c.post('/auth/logout');
    const stale = new Client(app);
    stale.cookie = cookie;
    expect((await stale.get('/auth/me')).statusCode).toBe(401);
  });

  it('fluxo MFA (TOTP) completo', async () => {
    const c = await Client.registered(app);
    const setup = await c.post('/auth/mfa/setup');
    expect(setup.data.otpauthUrl).toContain('otpauth://');
    expect((await c.post('/auth/mfa/enable', { code: '000000' })).statusCode).toBe(400);
    expect((await c.post('/auth/mfa/enable', { code: authenticator.generate(setup.data.secret) })).data.mfaEnabled).toBe(true);

    const login = new Client(app);
    const step1 = await login.post('/auth/login', { email: c.email, password: 'SenhaForte123' });
    expect(step1.statusCode).toBe(401);
    expect(step1.data.mfaRequired).toBe(true);
    const step2 = await login.post('/auth/login', { email: c.email, password: 'SenhaForte123', mfaCode: authenticator.generate(setup.data.secret) });
    expect(step2.statusCode).toBe(200);
    // Segredo nunca é armazenado em texto puro
    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: c.email } });
    expect(user.mfaSecretEnc).not.toContain(setup.data.secret);
  });
});

describe('isolamento entre usuários', () => {
  it('usuário B não lê, altera nem referencia dados do usuário A', async () => {
    const a = await Client.registered(app, 'Dr. A');
    const b = await Client.registered(app, 'Dr. B');
    const inst = (await a.post('/institutions', { name: 'Hospital do A' })).data;
    expect((await b.get(`/institutions/${inst.id}`)).statusCode).toBe(404);
    expect((await b.patch(`/institutions/${inst.id}`, { name: 'hack' })).statusCode).toBe(404);
    expect((await b.del(`/institutions/${inst.id}`)).statusCode).toBe(404);
    expect((await b.get('/institutions')).data).toHaveLength(0);
    const shift = await b.post('/shifts', { institutionId: inst.id, date: '2025-10-10', type: 'DIURNO', amount: '1000' });
    expect(shift.statusCode).toBe(404);
    const exp = await b.post('/expenses', { description: 'x', amount: '10', competenceDate: '2025-10-10', categoryId: (await a.get('/expense-categories')).data[0].id });
    expect(exp.statusCode).toBe(404);
  });
});

describe('privacidade (LGPD)', () => {
  it('exporta e exclui todos os dados', async () => {
    const c = await Client.registered(app);
    await c.post('/institutions', { name: 'Clínica' });
    const exp = await c.get('/privacy/export');
    expect(exp.statusCode).toBe(200);
    expect(exp.data.institutions).toHaveLength(1);
    expect(JSON.stringify(exp.data)).not.toContain('passwordHash');
    expect((await c.post('/privacy/delete-account', { password: 'SenhaForte123', confirmation: 'errado' })).statusCode).toBe(400);
    expect((await c.post('/privacy/delete-account', { password: 'SenhaForte123', confirmation: 'EXCLUIR MINHA CONTA' })).statusCode).toBe(200);
    expect(await app.prisma.user.findUnique({ where: { email: c.email } })).toBeNull();
    expect(await app.prisma.institution.count({ where: { name: 'Clínica', user: { email: c.email } } })).toBe(0);
  });

  it('operações relevantes geram trilha de auditoria', async () => {
    const c = await Client.registered(app);
    await c.post('/institutions', { name: 'H' });
    const log = await c.get('/audit');
    expect(log.data.map((l: any) => `${l.action}:${l.entity}`)).toContain('CREATE:Institution');
  });
});
