import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado`);

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'Dados inválidos', r.error.flatten());
  return r.data;
}

// ---------- Validadores reutilizáveis ----------
export const zMoney = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^-?\d{1,12}(\.\d{1,2})?$/.test(v), 'Valor monetário inválido (máx. 2 casas decimais)');
export const zPositiveMoney = zMoney.refine((v) => Number(v) >= 0, 'Valor não pode ser negativo');
export const zPercent = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) <= 100, 'Percentual inválido (0–100)');
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Data inexistente');
export const zYearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (YYYY-MM)');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (HH:MM)');
export const zId = z.string().min(1).max(64);

export const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
export const toDateOrNull = (d: string | null | undefined) => (d ? toDate(d) : d === null ? null : undefined);
export const fromDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const dec = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));

/** Converte Decimal -> string e Date -> ISO (datas puras -> YYYY-MM-DD) recursivamente. */
export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'passwordHash' || k === 'mfaSecretEnc' || k === 'tokenHash') continue;
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
}

export function errorHandler(error: Error & { statusCode?: number; validation?: unknown }, req: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.message, details: error.details });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'Dados inválidos', details: error.flatten() });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return reply.status(409).send({ error: 'Registro duplicado' });
    if (error.code === 'P2003') return reply.status(409).send({ error: 'Registro em uso por outros lançamentos' });
    if (error.code === 'P2025') return reply.status(404).send({ error: 'Registro não encontrado' });
  }
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  req.log.error(error);
  return reply.status(500).send({ error: 'Erro interno' });
}
