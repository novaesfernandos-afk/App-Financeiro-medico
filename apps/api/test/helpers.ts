import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

export async function makeApp() {
  const url = process.env.TEST_DATABASE_URL!;
  const env = loadEnv({ ...process.env, DATABASE_URL: url, NODE_ENV: 'test' });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const app = await buildApp(env, prisma);
  await app.ready();
  return app;
}

let counter = 0;

/** Cliente HTTP com cookie de sessão. */
export class Client {
  cookie = '';
  constructor(private app: FastifyInstance) {}

  async req(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<LightMyRequestResponse & { body: string; data: any }> {
    const res = await this.app.inject({ method, url: `/api${url}`, payload: body as never, headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = res.headers['set-cookie'];
    if (set) this.cookie = (Array.isArray(set) ? set : [set]).map((c) => c.split(';')[0]).join('; ');
    let data: unknown = null;
    try { data = res.json(); } catch { /* vazio */ }
    return Object.assign(res, { data });
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b?: unknown) => this.req('POST', u, b ?? {});
  patch = (u: string, b: unknown) => this.req('PATCH', u, b);
  put = (u: string, b: unknown) => this.req('PUT', u, b);
  del = (u: string) => this.req('DELETE', u);

  static async registered(app: FastifyInstance, name = 'Dra. Teste') {
    const c = new Client(app);
    const email = `user${Date.now()}${counter++}@teste.med.br`;
    const r = await c.post('/auth/register', { name, email, password: 'SenhaForte123' });
    if (r.statusCode !== 201) throw new Error(r.body);
    return Object.assign(c, { email });
  }
}
