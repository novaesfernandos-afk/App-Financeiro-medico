import type { FastifyInstance } from 'fastify';
import type { ZodObject, ZodRawShape } from 'zod';
import { audit } from './audit';
import { notFound, parse, serialize } from './http';

/**
 * Fábrica de rotas CRUD com isolamento por usuário e auditoria.
 * Toda consulta filtra por userId; atualizações/remoções verificam a posse antes.
 */
export interface CrudOptions<Shape extends ZodRawShape> {
  path: string;
  model: string;
  entity: string;
  schema: ZodObject<Shape>;
  /** Converte o corpo validado em dados Prisma (datas, decimais, checagem de referências). */
  toData: (body: Record<string, unknown>, userId: string, partial: boolean) => Promise<Record<string, unknown>> | Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
  include?: Record<string, unknown>;
  /** Remoção lógica (archived=true) em vez de exclusão física. */
  softDelete?: boolean;
  beforeDelete?: (id: string, userId: string) => Promise<void>;
}

export function registerCrud<Shape extends ZodRawShape>(app: FastifyInstance, o: CrudOptions<Shape>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = () => (app.prisma as any)[o.model];

  app.get(o.path, async (req) => {
    const q = req.query as { includeArchived?: string };
    const where: Record<string, unknown> = { userId: req.userId };
    if (o.softDelete && q.includeArchived !== 'true') where.archived = false;
    return serialize(await delegate().findMany({ where, orderBy: o.orderBy, include: o.include }));
  });

  app.get(`${o.path}/:id`, async (req) => {
    const { id } = req.params as { id: string };
    const row = await delegate().findFirst({ where: { id, userId: req.userId }, include: o.include });
    if (!row) throw notFound(o.entity);
    return serialize(row);
  });

  app.post(o.path, async (req, reply) => {
    const body = parse(o.schema, req.body) as Record<string, unknown>;
    const data = await o.toData(body, req.userId, false);
    const row = await delegate().create({ data: { ...data, userId: req.userId }, include: o.include });
    await audit(app, req, 'CREATE', o.entity, row.id);
    return reply.status(201).send(serialize(row));
  });

  app.patch(`${o.path}/:id`, async (req) => {
    const { id } = req.params as { id: string };
    const existing = await delegate().findFirst({ where: { id, userId: req.userId }, select: { id: true } });
    if (!existing) throw notFound(o.entity);
    const body = parse(o.schema.partial(), req.body) as Record<string, unknown>;
    const data = await o.toData(body, req.userId, true);
    const row = await delegate().update({ where: { id }, data, include: o.include });
    await audit(app, req, 'UPDATE', o.entity, id, { fields: Object.keys(body) });
    return serialize(row);
  });

  app.delete(`${o.path}/:id`, async (req) => {
    const { id } = req.params as { id: string };
    const existing = await delegate().findFirst({ where: { id, userId: req.userId }, select: { id: true } });
    if (!existing) throw notFound(o.entity);
    if (o.beforeDelete) await o.beforeDelete(id, req.userId);
    if (o.softDelete) await delegate().update({ where: { id }, data: { archived: true } });
    else await delegate().delete({ where: { id } });
    await audit(app, req, 'DELETE', o.entity, id);
    return { ok: true };
  });
}

/** Remove chaves undefined (atualizações parciais). */
export function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
