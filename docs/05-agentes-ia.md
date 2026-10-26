# 05 — Sistema multiagente de IA (Fase 4)

Especificação dos agentes **do produto** (assistente financeiro). A equipe de agentes de **desenvolvimento** está em [`.claude/agents`](../.claude/agents).

## Princípios

1. **LLM interpreta, o motor calcula.** Todo número vem de ferramentas determinísticas sobre `@medfinance/core` (ledger, dashboard, tax, projeções). O modelo nunca faz aritmética financeira final.
2. **Somente dados autorizados do usuário**, respeitando filtros e datas da pergunta. Dados ausentes ⇒ "não há registro" — nunca inventar.
3. **Rotular naturezas**: toda resposta separa REAL, ESTIMADO e PROJETADO e cita o período.
4. **Rastreabilidade**: respostas trazem os `ledger keys`/`trace` usados (critério de aceite 8).
5. **Somente leitura por padrão.** Propostas de criação/alteração viram um "rascunho de ação" que o usuário confirma na interface; agentes nunca excluem lançamentos.
6. **Privacidade**: envio ao provedor de LLM só com consentimento explícito (opt-in em Ajustes), minimização (agregados em vez de lançamentos quando possível) e sem identificadores pessoais (nome, CRM, CNPJ).
7. **Sem promessas de rentabilidade** nem recomendações de produtos financeiros específicos; não substitui contador.

## Orquestração

```
Pergunta → Agente 01 (Orquestrador)
  1. classifica intenção, período e filtros
  2. seleciona agentes especialistas (paralelo quando independentes)
  3. especialistas chamam ferramentas determinísticas (skills)
  4. Agente 06 (Auditor) valida consistência entre resultados
  5. Orquestrador consolida, resolve contradições (prevalece o número do motor), anexa fontes
```

Ferramentas comuns (somente leitura): `ledger.query(from,to,filters)`, `dashboard.get(month,filters)`, `calendar.day(date)`, `tax.summary(year)`, `tax.simulate(gross,date,profile)`, `receivables.list()`, `scenario.run(spec)` (Fase 4), `portfolio.get()` (Fase 3).

## Agentes

| # | Agente | Responsabilidade | Ferramentas autorizadas | Limites | Validação |
|---|---|---|---|---|---|
| 01 | Orquestrador Central | Interpretar pedido, rotear, consolidar | todas (leitura), roteamento | não calcula; não escreve | resposta cita período, natureza e fontes |
| 02 | Remuneração Médica | Plantões, vínculos, valor/hora, rentabilidade por instituição | ledger, dashboard.byInstitution, shift-calculator | não altera plantões | soma por instituição = total do dashboard |
| 03 | Tributário | Impostos, retenções, PF×PJ, obrigações | tax.summary, tax.simulate, perfis/vigências | só regras cadastradas e versionadas; cita vigência/fonte; diferencia estimado×confirmado; recomenda validar com contador | alíquota efetiva recalculada = imposto/bruto |
| 04 | Planejador Financeiro | Orçamento, capacidade de poupança, reserva, metas | dashboard, financial-goals, cashflow-forecast | usa média dos últimos meses REAIS; explicita premissas | capacidade = líquido real médio − despesas médias |
| 05 | Analista de Investimentos | Alocação, liquidez, concentração, risco | portfolio-tracker, investment-analyzer (Fase 3) | sem promessa de retorno; sem indicar produto | cotações com fonte/horário |
| 06 | Auditor Financeiro | Duplicidades, recebimentos faltantes, despesas atípicas, divergências | anomaly-detector, payment-reconciliation, ledger | só aponta; correção exige usuário | cada achado com chaves do ledger |
| 07 | Analista Preditivo | Fluxo de caixa, sazonalidade, meses críticos | cashflow-forecast, scenario-simulator | projeções marcadas como PROJETADO com premissas | backtest simples nos 12 meses anteriores |
| 08 | Gestor de Calendário | Vencimentos, pagamentos, escalas, alertas | calendar, notification-manager | criar escala = rascunho p/ confirmação | sem conflito de horários |
| 09 | Patrimônio | Ativos, passivos, evolução do PL | portfolio-tracker, contas, metas | aportes = transferência | PL = ativos − passivos |
| 10 | Dados | Relatórios, comparativos, exportações | report-generator | só dados do usuário | totais conferem com dashboard |
| 11 | Segurança e Privacidade | Consentimento, minimização, mascaramento | privacy-guardian | bloqueia envio sem consentimento | nenhum PII no payload ao LLM |
| 12 | Consultor Estratégico | Diagnóstico consolidado e plano de ação | resultados dos demais | não cria números próprios | cada recomendação ligada a um dado |

## Exemplos de roteamento

| Pergunta | Agentes | Ferramenta principal |
|---|---|---|
| "Quanto ganhei líquido no último mês?" | 02 | `dashboard.get(mês anterior).kpis.netRevenue` + decomposição REAL/ESTIMADO |
| "Qual hospital me paga melhor por hora?" | 02 | `dashboard.byInstitution[].netPerHour` (12 meses) |
| "Quanto tenho a receber no próximo mês?" | 07, 08 | `receivables` filtrado por data de caixa |
| "Quanto paguei de impostos neste ano?" | 03 | `tax.summary(ano)` (retido + guias pagas; provisionado à parte) |
| "Quanto receberei se fizer mais 4 plantões?" | 02, 07 | `scenario.run({addShifts: 4, institution})` via shift-calculator |
| "Quais despesas aumentaram nos últimos 3 meses?" | 06 | anomaly-detector por categoria |

## Implementação prevista

`packages/ai`: registro de agentes (prompt de sistema, ferramentas, limites), adaptador de provedor (Anthropic Claude por padrão, modular), ferramentas tipadas que chamam a API interna com o `userId` da sessão, log de cada chamada (pergunta, ferramentas, chaves do ledger) para auditoria.
