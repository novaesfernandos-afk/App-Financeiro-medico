/**
 * Aplica migrações Prisma pendentes no banco usado pela Function (cold start).
 * Compatível com `prisma migrate deploy`: usa a tabela _prisma_migrations e o mesmo
 * checksum (SHA-256 do migration.sql). Um advisory lock evita execuções concorrentes.
 * As migrações são embutidas no bundle pelo build (scripts/build-netlify-function.mjs).
 */
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

declare const __MIGRATIONS__: { name: string; sql: string }[];

const LOCK_KEY = 72707369; // chave arbitrária e fixa para o advisory lock

function statements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

export async function applyPendingMigrations(prisma: PrismaClient): Promise<string[]> {
  const applied: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
    await tx.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
    const done = await tx.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const doneSet = new Set(done.map((d) => d.migration_name));
    for (const m of __MIGRATIONS__) {
      if (doneSet.has(m.name)) continue;
      for (const stmt of statements(m.sql)) await tx.$executeRawUnsafe(stmt);
      await tx.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)`,
        randomUUID(), createHash('sha256').update(m.sql).digest('hex'), m.name);
      applied.push(m.name);
    }
  }, { timeout: 60_000, maxWait: 30_000 });
  return applied;
}
