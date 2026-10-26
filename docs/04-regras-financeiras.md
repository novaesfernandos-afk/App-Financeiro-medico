# 04 — Regras financeiras

Implementadas em `packages/core` e cobertas por testes (`packages/core/test`).

## 1. Competência × caixa

| Conceito | Data usada | Exemplos |
|---|---|---|
| Receita bruta/líquida do mês | competência (data do trabalho) | plantão de 28/10 conta em outubro |
| Recebido no mês | data efetiva de recebimento | o mesmo plantão, pago em 20/11, entra no caixa de novembro |
| Despesas do mês | competência (data da compra/consumo) | compra no cartão em 12/10 conta em outubro |
| Saldo disponível | caixa | só itens efetivados até hoje |

Cada item tem `certainty`: **REAL** (recebido/pago), **ESTIMATED** (devido, ainda não liquidado), **PROJECTED** (agendado/futuro). O painel mostra o líquido decomposto nessas três naturezas.

## 2. Impostos

- Sem perfil tributário ⇒ imposto **zero** com status `NOT_CONFIGURED` e alerta no painel. Nunca há alíquota padrão.
- Ordem de precedência por lançamento: **imposto confirmado** (valor informado) → **override do lançamento** → **perfil do lançamento** → **perfil do vínculo**.
- Perfis têm vigências (`validFrom`/`validTo`) sem sobreposição; criar nova vigência encerra a anterior na véspera. O cálculo usa a vigência da **data de competência**.
- Componentes: `PERCENT` (sobre o bruto ou sobre o bruto menos tributos anteriores), `FIXED` (por lançamento), `PROGRESSIVE` (faixas com parcela a deduzir). `withheldAtSource` separa retido na fonte do valor a recolher.
- Guias pagas (DAS, ISS, Carnê-Leão, IRPJ…) são **despesas** da categoria Tributos (`isTax`): aparecem como "impostos pagos" e no calendário como "Imposto".
- **Sem dupla contagem PJ/PF**: o faturamento da PJ é a receita tributada; pró-labore e distribuição de lucros são lançados como receitas da PF sem novo perfil da PJ (orientação exibida no formulário).

## 3. Plantões

- Duração: término ≤ início ⇒ vira o dia (19:00–07:00 = 12 h; 07:00–07:00 = 24 h).
- `bruto = base (por plantão ou horas × valor/hora) + adicional% × base + bonificações`; `líquido = bruto − impostos − descontos`.
- Tabela de valores por instituição/vínculo; regra de dia da semana tem prioridade sobre a genérica.
- Data prevista de pagamento: regra do vínculo → regra da instituição → data do plantão. Modos: "X dias após" ou "dia D, N meses depois".
- Status: agendado → realizado → faturado → a receber → recebido; **atrasado** é derivado (trabalhado, não recebido e data prevista vencida). Cancelados não contam.
- Recebido com valor informado substitui o líquido estimado (REAL).

## 4. Vínculos fixos

- Bruto da competência = último reajuste vigente (ou salário base) + adicionais.
- Dias de pagamento múltiplos dividem o valor sem perder centavos (quinzenal).
- `payMonthOffset` define se paga no mês ou no seguinte.
- `trackFrom`: competências anteriores ao início do acompanhamento **não** são geradas (evita meses "a receber" que o usuário nunca registrou).
- Recebimento confirmado por (vínculo, competência, parcela), com valor e imposto efetivos.

## 5. Despesas e cartão

- Parcelamento: o valor total é dividido exatamente (centavos residuais nas primeiras parcelas), uma parcela por mês.
- Compra no cartão: consumo na data da compra; **não** afeta caixa. A fatura (agrupada por cartão e mês de vencimento) é a saída de caixa e **não** é despesa. Compras a partir do dia de fechamento vão para a fatura seguinte.
- Contas fixas: repetição mensal com grupo; edição em lote aplica a parcelas pendentes futuras.
- Aumento atípico: categoria com alta > 30 % e > R$ 100 versus o mês anterior.

## 6. Saldo e projeção

- Saldo disponível = Σ saldos iniciais (no início do dia de referência) + entradas efetivadas − saídas efetivadas (inclui faturas pagas, exclui compras no cartão).
- Saldo previsto (calendário) inclui também pendentes e projetados.
- Previsão dos próximos 3 meses = entradas/saídas pendentes por data de caixa.

## 7. Investimentos (Fase 3)

Aportes serão **transferências** entre conta e carteira (não despesas); patrimônio = contas + carteira a mercado + bens − dívidas. Cotações exibirão fonte e horário.
