# 02 — Modelo de dados

Fonte da verdade: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma). Migração inicial em `apps/api/prisma/migrations`.

## Convenções

- Todo registro de negócio tem `userId` (isolamento). Exclusão do usuário apaga tudo em cascata (LGPD).
- Monetário `Decimal(14,2)`; percentuais `Decimal(7,4)`; datas financeiras `DATE`.
- Bruto/imposto/líquido **não são persistidos** — são derivados pelo core.

## Entidades

| Entidade | Papel | Campos-chave |
|---|---|---|
| `User`, `Session` | Conta e sessões revogáveis | `passwordHash` (argon2), `mfaSecretEnc` (AES-256-GCM), `tokenHash` |
| `Profile` | Perfil profissional e financeiro | especialidade, CRM, renda estimada, reserva desejada, patrimônio/investimentos declarados |
| `Company` | PJ médica | CNPJ, regime tributário, honorários contábeis |
| `Institution` | Hospital, clínica, universidade, telemedicina… | cor, `paymentRule` padrão de plantões |
| `TaxProfile` / `TaxProfileVersion` | Regra tributária versionada | `validFrom/validTo`, `components` (JSON), `confidence`, `legalReference`, `source` |
| `Contract` (vínculo) | Relação de trabalho | tipo (CLT/PJ/PF/COOPERATIVA/OUTRO), salário bruto, adicionais, descontos, dias de pagamento, `payMonthOffset`, `trackFrom`, `taxProfileId`, `shiftPaymentRule` |
| `SalaryAdjustment` | Reajustes | `effectiveDate`, novo bruto — único por (vínculo, data) |
| `ShiftRate` | Tabela de valores de plantão | por instituição/vínculo, tipo e dia da semana |
| `ShiftSeries` | Escala recorrente | `rule` (RecurrenceRule), `template` |
| `Shift` | Plantão | data de trabalho, horários, tipo, status, preço, adicional, bônus, descontos, imposto próprio, **data prevista de pagamento**, recebimento efetivo |
| `SalaryPayment` | Confirmação de recebimento do fixo | único por (vínculo, competência, parcela) |
| `Income` | Outras receitas | categoria, competência, previsão, bruto, imposto/override/confirmado, horas |
| `ExpenseCategory` | Categorias pessoais/profissionais | `isTax`, orçamento mensal |
| `Expense` | Despesa | competência, vencimento, pagamento, forma, cartão, parcelamento (`installmentGroupId`), recorrência (`recurringGroupId`), centro de custo |
| `CreditCard`, `CardInvoicePayment` | Cartão e pagamento de fatura | fatura única por (cartão, mês de referência) |
| `BankAccount` | Contas | saldo inicial + data de referência |
| `Goal` | Metas | alvo, acumulado, prazo |
| `AuditLog` | Trilha de auditoria | ação, entidade, id, metadados (sem valores sensíveis) |

## Chaves que impedem duplicidade

| Situação | Mecanismo |
|---|---|
| Reprocessar/estender escala | `@@unique([seriesId, date])` + `createMany(skipDuplicates)` |
| Mesmo plantão lançado 2× | Checagem (instituição, data, início) → HTTP 409 até confirmação |
| Salário confirmado 2× | `@@unique([contractId, competence, index])` + upsert |
| Compra no cartão + pagamento da fatura | Compra = consumo (`isConsumption`), fatura = saída de caixa (`affectsCash`) — nunca ambos |
| Fatura paga 2× | `@@unique([cardId, reference])` |
| Itens do ledger | `key` único por origem (`shift:id`, `salary:contrato:AAAA-MM:i`, `invoice:cartão:AAAA-MM`…) |

## Fase 3 (planejado)

`Investment`, `InvestmentTransaction` (aporte/resgate como transferência), `Quote` (fonte + horário), `Asset`/`Liability` (imóveis, veículos, financiamentos), `ImportBatch` (OFX/CSV com hash por linha para deduplicar), `Attachment` (comprovantes, armazenamento em objeto com criptografia).
