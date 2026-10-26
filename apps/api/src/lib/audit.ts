import type { FastifyInstance, FastifyRequest } from 'fastify';

/** Registra operações relevantes. Não grava valores sensíveis completos — apenas metadados. */
export async function audit(
  app: FastifyInstance,
  req: FastifyRequest,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'MFA_ENABLE' | 'MFA_DISABLE' | 'EXPORT' | 'BULK',
  entity: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  await app.prisma.auditLog.create({
    data: { userId: req.userId, action, entity, entityId: entityId ?? null, details: (details ?? undefined) as never, ip: req.ip },
  });
}
