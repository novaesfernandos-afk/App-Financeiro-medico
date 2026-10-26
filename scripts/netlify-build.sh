#!/usr/bin/env bash
# Build da Netlify: gera o Prisma Client, aplica migrações e compila a Function e o frontend.
# Sem banco/segredos configurados o site é publicado mesmo assim e exibe uma tela de
# "configuração pendente" (a API responde 503 dizendo o que falta) — nada é inventado.
set -euo pipefail

# Netlify DB (Neon) expõe NETLIFY_DATABASE_URL(_UNPOOLED); migrações usam a conexão direta.
export DATABASE_URL="${DATABASE_URL:-${NETLIFY_DATABASE_URL_UNPOOLED:-${NETLIFY_DATABASE_URL:-}}}"
SCHEMA=apps/api/prisma/schema.prisma

missing=()
[ -z "${DATABASE_URL}" ] && missing+=("banco de dados (Netlify DB ou DATABASE_URL)")
[ -z "${COOKIE_SECRET:-}" ] && missing+=("COOKIE_SECRET")
[ -z "${ENCRYPTION_KEY:-}" ] && missing+=("ENCRYPTION_KEY")

npx prisma generate --schema "$SCHEMA"
if [ -n "${DATABASE_URL}" ]; then
  npx prisma migrate deploy --schema "$SCHEMA"
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo "::warning:: Configuração pendente: ${missing[*]}. O site será publicado em modo 'configuração pendente'. Veja docs/11-deploy-netlify.md" >&2
fi

node scripts/build-netlify-function.mjs
npm run build -w @medfinance/web
