#!/usr/bin/env bash
# Build da Netlify: gera o Prisma Client, aplica migrações e compila o frontend.
set -euo pipefail

# Netlify DB (Neon) expõe NETLIFY_DATABASE_URL(_UNPOOLED); migrações usam a conexão direta.
export DATABASE_URL="${DATABASE_URL:-${NETLIFY_DATABASE_URL_UNPOOLED:-${NETLIFY_DATABASE_URL:-}}}"
if [ -z "${DATABASE_URL}" ]; then
  echo "ERRO: configure o banco (Netlify DB ou variável DATABASE_URL). Veja docs/11-deploy-netlify.md" >&2
  exit 1
fi
for v in COOKIE_SECRET ENCRYPTION_KEY; do
  if [ -z "${!v:-}" ]; then echo "ERRO: variável $v não definida no painel da Netlify" >&2; exit 1; fi
done

SCHEMA=apps/api/prisma/schema.prisma
npx prisma generate --schema "$SCHEMA"
npx prisma migrate deploy --schema "$SCHEMA"
node scripts/build-netlify-function.mjs
npm run build -w @medfinance/web
