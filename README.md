# MedFinance AI

Aplicativo de gestão financeira para médicos brasileiros: múltiplos hospitais, plantões, vínculos CLT/PJ/PF/cooperativa, tributação por fonte, despesas pessoais e profissionais, calendário financeiro e (nas próximas fases) investimentos, patrimônio e assistente de IA multiagente.

> Objetivo: o médico entender **quanto ganha, quanto efetivamente recebe, quanto gasta, quanto investe, quanto tem de patrimônio e quanto terá disponível nos próximos meses**.

## Status

| Fase | Escopo | Status |
|---|---|---|
| 1 — Planejamento | Arquitetura, modelo de dados, design system, regras financeiras, agentes, skills | ✅ Concluída ([docs/](docs)) |
| 2 — MVP funcional | Autenticação + MFA, instituições, vínculos, salários, plantões (avulsos e escalas), impostos versionados, receitas, despesas, cartões, calendário, dashboard, LGPD | ✅ Concluída |
| 3 — Gestão avançada | Investimentos, patrimônio, importação OFX/CSV, relatórios PDF/Excel, conciliação | ⏳ Próxima |
| 4 — Inteligência artificial | Orquestrador + 12 agentes, skills de IA, simulações, assistente | 📐 Especificada ([docs/05-agentes-ia.md](docs/05-agentes-ia.md)) |
| 5 — Qualidade e publicação | Hardening, performance, lojas | ⏳ |

Detalhes em [docs/07-plano-implementacao.md](docs/07-plano-implementacao.md).

## Stack

- **Monorepo npm workspaces**
- `packages/core` — `@medfinance/core`: motor financeiro puro em TypeScript (decimal.js, sem ponto flutuante). Única fonte de cálculos para dashboard, calendário, relatórios e IA.
- `apps/api` — Node.js + Fastify 5 + Prisma 6 + PostgreSQL 16. Sessão httpOnly, argon2, MFA TOTP, auditoria.
- `apps/web` — React 18 + Vite 6 + TypeScript + Tailwind (componentes no estilo shadcn/ui sobre Radix) + Recharts + FullCalendar + TanStack Query. PWA instalável.

## Como rodar

Pré-requisitos: Node 20+, PostgreSQL 16 (ou Docker).

```bash
npm install
docker compose up -d                 # ou use um PostgreSQL local
cp .env.example apps/api/.env        # ajuste COOKIE_SECRET e ENCRYPTION_KEY (openssl rand -hex 32)
npm run db:deploy -w @medfinance/api # aplica as migrações
npm run dev                          # API :3333 + web :5173 (proxy /api)
```

Acesse http://localhost:5173, crie uma conta e siga o assistente inicial. Não há dados de demonstração: tudo o que aparece foi cadastrado por você.

## Testes

```bash
npm run test -w @medfinance/core     # 44 testes unitários do motor financeiro
npm run test -w @medfinance/api      # 25 testes de integração (PostgreSQL real, banco TEST_DATABASE_URL)
npm run test:e2e                     # Playwright desktop + mobile (requer `npm run dev` rodando)
npm run typecheck                    # TypeScript em todos os pacotes
```

O banco de testes precisa ter "test" no nome (proteção contra uso acidental do banco real). O setup apenas sincroniza o schema (`prisma db push`) — não apaga dados; cada teste cria usuários próprios.

## Documentação

| Documento | Conteúdo |
|---|---|
| [01 — Arquitetura](docs/01-arquitetura.md) | Camadas, fluxo de dados, estrutura de pastas |
| [02 — Modelo de dados](docs/02-modelo-dados.md) | Entidades, chaves de deduplicação, convenções |
| [03 — Design system](docs/03-design-system.md) | Tokens, cores, componentes, acessibilidade |
| [04 — Regras financeiras](docs/04-regras-financeiras.md) | Competência × caixa, impostos, cartão, plantões |
| [05 — Agentes de IA](docs/05-agentes-ia.md) | 12 agentes do produto + orquestração |
| [06 — Skills](docs/06-skills.md) | Contratos das 16 skills |
| [07 — Plano](docs/07-plano-implementacao.md) | Fases, entregas, pendências |
| [08 — Jornadas](docs/08-jornadas.md) | Jornadas do usuário |
| [09 — Segurança e LGPD](docs/09-seguranca-lgpd.md) | Controles implementados e pendentes |
| [10 — Integrações](docs/10-integracoes.md) | Dependências externas e credenciais |

Equipe de agentes de desenvolvimento: [.claude/agents](.claude/agents).
