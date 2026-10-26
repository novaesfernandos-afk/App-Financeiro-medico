# 01 — Arquitetura

## Visão geral

```
┌─────────────────────────── apps/web (PWA) ───────────────────────────┐
│ React + Vite + Tailwind + Radix · TanStack Query · Recharts · FullCal │
│  Páginas: Painel · Calendário · Plantões · Receitas · Despesas ·      │
│           Impostos · Ajustes · Assistente inicial                     │
└───────────────┬───────────────────────────────────────────────────────┘
                │ HTTPS /api (cookie de sessão httpOnly, SameSite=strict)
┌───────────────▼────────────── apps/api ───────────────────────────────┐
│ Fastify 5 · zod · helmet · rate-limit · auditoria                     │
│  Rotas CRUD (isolamento por userId + assertOwned)                     │
│  Rotas analíticas: /dashboard /calendar /ledger /receivables /tax/*   │
│        │                                                              │
│        ▼  services/ledger-loader → mappers (Prisma → tipos do core)    │
└────────┬─────────────────────────────────────────────┬────────────────┘
         │                                             │
┌────────▼──────── packages/core ────────┐   ┌─────────▼─────────┐
│ money · dates · tax (versionado)       │   │ PostgreSQL 16     │
│ shifts · recurrence · salary · expenses│   │ (Prisma 6)        │
│ ledger ◄── fonte única dos números     │   └───────────────────┘
│ dashboard · calendar · skills          │
└────────────────────────────────────────┘
          ▲
          │ (Fase 4) ferramentas determinísticas
┌─────────┴──────── packages/ai (planejado) ─────────┐
│ Orquestrador + 12 agentes especializados            │
│ LLM apenas interpreta/explica; cálculos = core      │
└─────────────────────────────────────────────────────┘
```

### Princípios

1. **Camada central de regras** (`@medfinance/core`): funções puras, sem I/O, 100% testáveis. Dashboard, calendário, relatórios e IA consomem o mesmo `LedgerItem[]` → números idênticos em todas as telas.
2. **Insumos persistidos, resultados derivados**: o banco guarda os insumos (valor do plantão, perfil tributário, datas). Bruto, imposto e líquido são calculados a cada leitura usando a vigência tributária da data de competência. Valores efetivos (recebido, imposto confirmado) são insumos explícitos e prevalecem sobre estimativas.
3. **Precisão decimal**: `decimal.js` com arredondamento bancário; strings decimais trafegam entre camadas.
4. **Duas datas por evento**: competência (trabalho/consumo) e caixa (dinheiro). Cada item do ledger tem `certainty`: REAL, ESTIMATED ou PROJECTED.
5. **Rastreabilidade**: todo item do ledger carrega `trace` (texto que explica a conta) — base para auditoria e para respostas da IA.

## Estrutura de pastas

```
.
├── apps/
│   ├── api/
│   │   ├── prisma/schema.prisma        # modelo de dados
│   │   ├── prisma/migrations/          # migrações SQL
│   │   ├── src/
│   │   │   ├── app.ts                  # bootstrap Fastify (helmet, cookies, rate-limit)
│   │   │   ├── env.ts                  # validação de variáveis de ambiente
│   │   │   ├── lib/                    # auth, crypto, audit, ownership, crud, http
│   │   │   ├── routes/                 # auth, settings, taxes, contracts, shifts,
│   │   │   │                           # incomes, expenses, finance, privacy
│   │   │   └── services/               # ledger-loader, mappers
│   │   └── test/                       # integração (PostgreSQL real)
│   └── web/
│       ├── public/                     # ícones PWA
│       ├── e2e/                        # Playwright
│       └── src/
│           ├── components/ui/          # design system (button, card, form, dialog…)
│           ├── components/forms/       # formulários de domínio
│           ├── components/layout/      # AppShell, MonthPicker
│           ├── hooks/ lib/ pages/
├── packages/
│   └── core/src/                       # motor financeiro + testes em core/test
├── docs/                               # documentação de produto e arquitetura
├── .claude/agents/                     # equipe de agentes de desenvolvimento
└── docker-compose.yml                  # PostgreSQL local
```

## Decisões e trade-offs

| Decisão | Motivo | Consequência |
|---|---|---|
| Fastify em vez de Express | Performance, schema-first, plugins de segurança oficiais | — |
| Sessão em cookie httpOnly com token aleatório (hash no banco) em vez de JWT | Revogação imediata (logout, exclusão de conta) | Uma consulta por request |
| Cálculo on-read em vez de snapshot | Correção retroativa de perfil tributário reflete em tudo | Volume grande exigirá cache/janela (Fase 5) |
| Carregar todos os registros do usuário no ledger | Simplicidade e correção (recebíveis antigos) no MVP | Otimizar com janela temporal + agregados quando >10k lançamentos |
| Componentes próprios no estilo shadcn/ui (Radix + Tailwind) | Sem CLI externo, controle total dos tokens | — |
| PWA com cache só do shell | Dados financeiros nunca ficam em cache de service worker | Offline limitado à interface |
