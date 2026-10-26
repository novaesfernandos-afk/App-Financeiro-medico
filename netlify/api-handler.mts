/**
 * Handler da API (compilado por scripts/build-netlify-function.mjs para netlify/build/handler.mjs).
 * API do MedFinance como Netlify Function (v2, Web API Request/Response).
 * Reaproveita o mesmo app Fastify de apps/api via `inject` — sem servidor HTTP.
 * Banco: DATABASE_URL ou Netlify DB (Neon) via NETLIFY_DATABASE_URL.
 */
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app';
import { loadEnv } from '../apps/api/src/env';

function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!raw) return undefined;
  // Conexões serverless: uma conexão por instância, compatível com o pooler do Neon
  const url = new URL(raw);
  if (url.hostname.includes('-pooler') && !url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
  return url.toString();
}

let appPromise: Promise<FastifyInstance> | null = null;

function getApp() {
  if (!appPromise) {
    process.env.DATABASE_URL = databaseUrl();
    appPromise = (async () => {
      const app = await buildApp(loadEnv({ ...process.env, NODE_ENV: 'production' }));
      await app.ready();
      return app;
    })();
    appPromise.catch(() => { appPromise = null; });
  }
  return appPromise;
}

export default async (req: Request): Promise<Response> => {
  let app: FastifyInstance;
  try {
    app = await getApp();
  } catch (e) {
    console.error('Falha ao iniciar a API', e);
    return Response.json({ error: 'Servidor não configurado (verifique DATABASE_URL, COOKIE_SECRET e ENCRYPTION_KEY)' }, { status: 500 });
  }
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());

  const res = await app.inject({
    method: req.method as never,
    url: url.pathname + url.search,
    headers,
    payload: body && body.length ? body : undefined,
    remoteAddress: headers['x-nf-client-connection-ip'] ?? headers['x-forwarded-for']?.split(',')[0]?.trim(),
  });

  const out = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined || k === 'content-length' || k === 'transfer-encoding' || k === 'connection') continue;
    if (Array.isArray(v)) v.forEach((x) => out.append(k, String(x)));
    else out.set(k, String(v));
  }
  return new Response(res.statusCode === 204 || res.statusCode === 304 ? null : res.rawPayload, { status: res.statusCode, headers: out });
};

