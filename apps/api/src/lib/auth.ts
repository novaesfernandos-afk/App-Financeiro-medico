import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomToken, sha256 } from './crypto';
import { HttpError } from './http';

export const SESSION_COOKIE = 'mf_session';
const SESSION_DAYS = 7;

export async function createSession(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await app.prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, userAgent: req.headers['user-agent']?.slice(0, 200), ip: req.ip },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: app.env.NODE_ENV === 'production',
    expires: expiresAt,
    signed: true,
  });
}

export async function destroySession(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  const token = readToken(req);
  if (token) await app.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

function readToken(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/** preHandler: exige sessão válida e injeta request.userId (base do isolamento entre usuários). */
export function requireAuth(app: FastifyInstance) {
  return async (req: FastifyRequest) => {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Não autenticado');
    const session = await app.prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
    if (!session || session.expiresAt < new Date()) throw new HttpError(401, 'Sessão expirada');
    req.userId = session.userId;
  };
}
