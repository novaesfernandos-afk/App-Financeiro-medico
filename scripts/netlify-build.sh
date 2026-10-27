#!/usr/bin/env bash
# Build da Netlify: gera o Prisma Client e compila a Function e o frontend.
#
# Banco: DATABASE_URL (PostgreSQL externo) ou NETLIFY_DB_URL (Netlify Database).
# Migrações: apps/api/prisma/migrations, embutidas na Function e aplicadas por ela.
# Sem banco/segredos, o site é publicado em modo "configuração pendente".
set -euo pipefail
SCHEMA=apps/api/prisma/schema.prisma

missing=()
[ -z "${DATABASE_URL:-}${NETLIFY_DB_URL:-}" ] && missing+=("banco de dados (Netlify Database ou DATABASE_URL)")
[ -z "${COOKIE_SECRET:-}" ] && missing+=("COOKIE_SECRET")
[ -z "${ENCRYPTION_KEY:-}" ] && missing+=("ENCRYPTION_KEY")

npx prisma generate --schema "$SCHEMA"

# As migrações são aplicadas pela própria Function no primeiro acesso (netlify/migrate.mts),
# direto no banco que ela usa — funciona igual para Netlify Database e banco externo.
if [ ${#missing[@]} -gt 0 ]; then
  echo "::warning:: Configuração pendente: ${missing[*]}. O site será publicado em modo 'configuração pendente'. Veja docs/11-deploy-netlify.md" >&2
fi

node scripts/build-netlify-function.mjs
npm run build -w @medfinance/web
