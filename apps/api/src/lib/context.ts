import type { PrismaClient } from '@prisma/client';
import type { Env } from '../env';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    env: Env;
  }
  interface FastifyRequest {
    userId: string;
  }
}
