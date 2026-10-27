#!/usr/bin/env bash
# Build da Netlify: gera o Prisma Client e compila a Function e o frontend.
#
# Banco:
#  - Netlify Database (NETLIFY_DB_URL): as migrações em netlify/database/migrations são
#    aplicadas pela própria Netlify antes de publicar o deploy (não rodamos prisma migrate).
#  - Banco externo (DATABASE_URL definido manualmente): aplicamos `prisma migrate deploy`.
# Sem banco/segredos, o site é publicado em modo "configuração pendente".
set -euo pipefail
SCHEMA=apps/api/prisma/schema.prisma

# As migrações da Netlify precisam ser idênticas às do Prisma (fonte da verdade)
for dir in apps/api/prisma/migrations/*/; do
  name=$(basename "$dir")
  if ! cmp -s "$dir/migration.sql" "netlify/database/migrations/$name/migration.sql"; then
    echo "ERRO: migração $name difere entre apps/api/prisma/migrations e netlify/database/migrations" >&2
    exit 1
  fi
done

missing=()
[ -z "${DATABASE_URL:-}${NETLIFY_DB_URL:-}" ] && missing+=("banco de dados (Netlify Database ou DATABASE_URL)")
[ -z "${COOKIE_SECRET:-}" ] && missing+=("COOKIE_SECRET")
[ -z "${ENCRYPTION_KEY:-}" ] && missing+=("ENCRYPTION_KEY")

npx prisma generate --schema "$SCHEMA"
if [ -n "${DATABASE_URL:-}" ]; then
  npx prisma migrate deploy --schema "$SCHEMA"
elif [ -n "${NETLIFY_DB_URL:-}" ]; then
  echo "Netlify Database detectado: migrações serão aplicadas pela Netlify antes da publicação."
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo "::warning:: Configuração pendente: ${missing[*]}. O site será publicado em modo 'configuração pendente'. Veja docs/11-deploy-netlify.md" >&2
fi

node scripts/build-netlify-function.mjs
npm run build -w @medfinance/web
