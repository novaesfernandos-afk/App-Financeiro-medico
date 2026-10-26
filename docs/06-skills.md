# 06 — Skills

Skills são módulos reutilizáveis com entradas/saídas tipadas, validação, erros explícitos e testes. Registro em código: [`packages/core/src/skills.ts`](../packages/core/src/skills.ts). As determinísticas são as únicas autorizadas a produzir números (inclusive para a IA).

| Skill | Status | Módulo | Entrada → Saída | Erros/validações | Testes |
|---|---|---|---|---|---|
| `medical-income-tracker` | ✅ | `salary.ts`, `ledger.ts` | vínculos, pagamentos, receitas → `LedgerItem[]` | vigência do contrato, `trackFrom`, divisão exata | `shifts-salary`, `ledger-dashboard` |
| `shift-calculator` | ✅ | `shifts.ts` | preço, duração, perfil → `ShiftValues` (bruto, imposto, líquido, R$/h) | horário HH:MM, duração > 0 | `shifts-salary` |
| `tax-engine-br` | ✅ | `tax.ts` | bruto, data, perfil/override/confirmado → `TaxResult` | alíquota 0–100, soma ≤ 100, faixas crescentes, vigências sem sobreposição | `tax` |
| `financial-calendar` | ✅ | `calendar.ts` | ledger, intervalo → `CalendarEvent[]`, `DaySummary` | trabalho × pagamento | `ledger-dashboard` |
| `cashflow-forecast` | 🟡 | `dashboard.ts` | ledger → previsão 3 meses e saldo projetado | baseline de saldo | `ledger-dashboard` |
| `expense-classifier` | 🟡 | `expenses.ts` | total, parcelas, cartão → parcelas e fatura | 1–120 parcelas | `shifts-salary` |
| `privacy-guardian` | 🟡 | `api/routes/privacy.ts` | — → exportação JSON, exclusão | senha + frase de confirmação | `auth-security` |
| `report-generator` | 🟡 | `dashboard.ts`, `/tax/summary` | ledger → KPIs/comparativos | — | integração |
| `payment-reconciliation` | ⏳ F3 | — | extrato importado × recebíveis → pares/pendências | tolerância de valor/data | — |
| `financial-data-import` | ⏳ F3 | — | OFX/CSV/XLSX → lançamentos propostos | hash por linha (dedup), revisão antes de gravar | — |
| `investment-analyzer` | ⏳ F3 | — | carteira → alocação, liquidez, concentração | cotações com fonte/horário | — |
| `portfolio-tracker` | ⏳ F3 | — | contas, ativos, passivos → PL | aportes como transferência | — |
| `financial-goals` | ⏳ F3 | — | meta, prazo, capacidade → aporte mensal | prazo futuro | — |
| `notification-manager` | ⏳ F3 | — | vencimentos, atrasos → alertas | opt-in, sem dados sensíveis na notificação push | — |
| `anomaly-detector` | ⏳ F4 | — | ledger → duplicidades, atípicos, faltantes | limiares configuráveis | — |
| `scenario-simulator` | ⏳ F4 | — | ledger + cenário (± plantões, vínculos, despesas, regime) → comparativo | sem persistência | — |

Legenda: ✅ implementada · 🟡 parcial · ⏳ planejada (fase).

## Contrato padrão

```ts
type Skill<I, O> = {
  id: string;
  validate(input: unknown): I;          // lança erro de validação descritivo
  run(input: I): O;                     // pura e determinística
  trace?(input: I, output: O): string;  // explicação legível
};
```
