# 07 — Plano de implementação

## Fase 1 — Planejamento ✅

Arquitetura (01), modelo de dados (02), design system (03), regras financeiras (04), agentes (05), skills (06), jornadas (08), segurança (09), integrações (10).

## Fase 2 — MVP funcional ✅

| Entrega | Onde |
|---|---|
| Autenticação (argon2, sessão revogável, MFA TOTP, troca de senha, rate limit) | `api/routes/auth.ts`, Ajustes → Segurança |
| Assistente de cadastro inicial | `web/pages/Onboarding.tsx` |
| Perfil profissional/financeiro, empresas PJ | Ajustes → Perfil |
| Instituições com regra de pagamento e tabela de valores de plantão | Ajustes → Instituições |
| Vínculos CLT/PJ/PF/cooperativa com salário, adicionais, descontos, reajustes, perfil tributário | Receitas → Vínculos |
| Plantões avulsos e escalas (semanal, quinzenal, 12x36, mensal) sem duplicação, edição em lote | Plantões |
| Impostos por vínculo/lançamento, versionados, simulador, comparativo por fonte | Impostos |
| Outras receitas (consultas, cirurgias, aulas, lucros…) | Receitas → Outras |
| A receber / extrato com natureza real×estimado×projetado | Receitas |
| Despesas: categorias, parcelamento, contas fixas, cartão sem dupla contagem, orçamento, atípicos | Despesas |
| Contas bancárias, cartões, metas | Ajustes → Contas e cartões |
| Calendário dia/semana/mês/ano/lista com resumo do dia | Calendário |
| Dashboard com 10 KPIs, filtros, 4 gráficos e previsão | Painel |
| LGPD: exportação, exclusão, auditoria | Ajustes → Segurança e LGPD |
| PWA instalável | `vite-plugin-pwa` |

**Testes executados:** 44 unitários (core), 25 integração (API + PostgreSQL), E2E Playwright desktop e mobile.

### Pendências conhecidas da Fase 2

- Anexo de comprovantes (requer armazenamento de objetos — ver docs/10).
- Catálogo oficial de tabelas (INSS/IRRF/Simples) versionado e validado por contador — hoje o usuário/contador informa as alíquotas.
- Saldo por conta (hoje consolidado); vínculo de lançamento a conta específica.
- Alertas push/e-mail de vencimento (alertas visuais já existem no painel/calendário).
- Biometria (WebAuthn/passkeys) e sincronização com Google Calendar.

## Fase 3 — Gestão financeira avançada

1. Investimentos (classes, aportes/resgates como transferência, cotações com fonte/horário), patrimônio (bens, dívidas, financiamentos), evolução do PL.
2. Importação OFX/CSV/XLSX com revisão e deduplicação; conciliação de recebimentos.
3. Relatórios mensais/anuais em PDF e Excel.
4. Saldo por conta, transferências, anexos, notificações.

## Fase 4 — Inteligência artificial

`packages/ai`, orquestrador + 12 agentes (docs/05), skills `anomaly-detector`, `scenario-simulator`, simuladores (mais plantões, redução de carga, independência financeira, aposentadoria), assistente conversacional com citações do ledger e consentimento.

## Fase 5 — Qualidade e publicação

Pen-test/OWASP ASVS, performance (janela temporal + agregados no ledger), testes em dispositivos, Lighthouse/PWA, observabilidade, backups automatizados, Capacitor para lojas.

## Como validar a Fase 2

1. `npm run dev`, abrir http://localhost:5173, criar conta.
2. Assistente: informe saldo, cartão e um hospital PJ com alíquota e valor de plantão.
3. Registre um plantão noturno sem digitar valor → a pré-visualização mostra bruto, imposto e líquido.
4. Painel: receita bruta/líquida/impostos refletem o plantão; "Recebido" continua zero.
5. Calendário: o plantão aparece no dia do trabalho; o recebimento previsto, na data de pagamento do hospital.
6. Lance uma compra parcelada no cartão: cada parcela conta no seu mês; a fatura aparece em Despesas → Faturas e não soma como despesa ao ser paga.
7. Crie uma escala semanal e estenda: nenhuma data duplica.
