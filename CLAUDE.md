# MedFinance AI — guia para agentes

Monorepo (npm workspaces): `packages/core` (motor financeiro puro), `apps/api` (Fastify + Prisma + PostgreSQL), `apps/web` (React + Vite PWA). Documentação em `docs/`. Interface e textos em português do Brasil.

## Regras invioláveis

1. **Todo número financeiro vem de `@medfinance/core`.** API, dashboard, calendário, relatórios e IA consomem o ledger (`buildLedger`). Não duplique cálculos no frontend nem na API.
2. **Dinheiro é string decimal + `decimal.js`.** Nunca `number` para aritmética monetária. Banco: `Decimal(14,2)`.
3. **Sem alíquota genérica.** Sem perfil tributário => imposto 0 e status `NOT_CONFIGURED`. Não preencha alíquotas "padrão".
4. **Isolamento por usuário.** Toda consulta filtra `userId`; toda FK recebida do cliente passa por `assertOwned`.
5. **Sem dados fictícios** apresentados como reais. Sem seeds de demonstração.
6. **Deduplicação por chave**: série+data (plantões), contrato+competência+parcela (salários), cartão+referência (faturas).
7. Operações em lote/destrutivas exigem confirmação explícita (`confirm: true`, senha, frase).
8. Agentes de IA (Fase 4) nunca criam/alteram/excluem lançamentos sem confirmação do usuário.

## Comandos

- `npm run test -w @medfinance/core` — unitários do motor
- `npm run test -w @medfinance/api` — integração (requer PostgreSQL e `TEST_DATABASE_URL` com "test" no nome)
- `npm run test:e2e` — Playwright (requer `npm run dev`)
- `npm run typecheck`
- Nunca rode `prisma db push --force-reset` / `migrate reset` sem autorização explícita.

## Convenções

- Datas financeiras: `YYYY-MM-DD` (sem fuso); fuso de referência America/Sao_Paulo.
- Rotas novas: validar com zod (`lib/http.ts`), auditar com `audit()`, serializar com `serialize()`.
- Nova regra financeira: implementar e testar em `packages/core` primeiro.
- UI: tokens de `apps/web/src/index.css`; componentes em `src/components/ui`.
