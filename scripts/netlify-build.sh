#!/usr/bin/env bash
# Build da Netlify: gera o Prisma Client, aplica migrações (Prisma) e compila a Function e o frontend.
#
# Banco: DATABASE_URL (PostgreSQL externo) ou NETLIFY_DB_URL (Netlify Database).
# As migrações ficam em apps/api/prisma/migrations e são aplicadas aqui com `prisma migrate deploy`
# (não usamos o diretório automático netlify/database/migrations, para não haver dois sistemas).
# Sem banco/segredos, o site é publicado em modo "configuração pendente".
set -euo pipefail
SCHEMA=apps/api/prisma/schema.prisma

missing=()
[ -z "${DATABASE_URL:-}${NETLIFY_DB_URL:-}" ] && missing+=("banco de dados (Netlify Database ou DATABASE_URL)")
[ -z "${COOKIE_SECRET:-}" ] && missing+=("COOKIE_SECRET")
[ -z "${ENCRYPTION_KEY:-}" ] && missing+=("ENCRYPTION_KEY")

npx prisma generate --schema "$SCHEMA"

DB_URL="${DATABASE_URL:-${NETLIFY_DB_URL:-}}"
if [ -n "$DB_URL" ]; then
  # Migrações exigem conexão direta (sem pooler de transações)
  MIGRATE_URL=$(node -e '
    const u = new URL(process.argv[1]);
    u.hostname = u.hostname.replace("-pooler", "");
    u.searchParams.delete("pgbouncer");
    console.log(u.toString());' "$DB_URL")
  echo "Aplicando migrações em $(node -e 'console.log(new URL(process.argv[1]).hostname)' "$MIGRATE_URL")"
  DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy --schema "$SCHEMA"
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo "::warning:: Configuração pendente: ${missing[*]}. O site será publicado em modo 'configuração pendente'. Veja docs/11-deploy-netlify.md" >&2
fi

node scripts/build-netlify-function.mjs
npm run build -w @medfinance/web
