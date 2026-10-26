import { addMonths, dateFromParts, type ISODate, type YearMonth, yearMonthOf } from './dates';
import { splitEvenly, toMoneyString, type MoneyInput } from './money';

/** Skill `expense-classifier` (parte determinística): parcelamentos e faturas de cartão. */

export const EXPENSE_SCOPES = ['PESSOAL', 'PROFISSIONAL'] as const;
export type ExpenseScope = (typeof EXPENSE_SCOPES)[number];

export const PAYMENT_METHODS = ['PIX', 'DEBITO', 'BOLETO', 'DINHEIRO', 'TRANSFERENCIA', 'CARTAO_CREDITO', 'DEBITO_AUTOMATICO'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_EXPENSE_CATEGORIES: { name: string; scope: ExpenseScope; isTax?: boolean; color: string }[] = [
  { name: 'Moradia', scope: 'PESSOAL', color: '#0f766e' },
  { name: 'Condomínio', scope: 'PESSOAL', color: '#0e7490' },
  { name: 'Alimentação', scope: 'PESSOAL', color: '#059669' },
  { name: 'Transporte', scope: 'PESSOAL', color: '#2563eb' },
  { name: 'Veículos', scope: 'PESSOAL', color: '#4f46e5' },
  { name: 'Saúde', scope: 'PESSOAL', color: '#db2777' },
  { name: 'Educação', scope: 'PESSOAL', color: '#7c3aed' },
  { name: 'Viagens', scope: 'PESSOAL', color: '#ea580c' },
  { name: 'Lazer', scope: 'PESSOAL', color: '#d97706' },
  { name: 'Assinaturas', scope: 'PESSOAL', color: '#65a30d' },
  { name: 'Seguros', scope: 'PESSOAL', color: '#0891b2' },
  { name: 'Compras', scope: 'PESSOAL', color: '#c026d3' },
  { name: 'Outras (pessoais)', scope: 'PESSOAL', color: '#64748b' },
  { name: 'CRM e sociedades médicas', scope: 'PROFISSIONAL', color: '#0d9488' },
  { name: 'Congressos', scope: 'PROFISSIONAL', color: '#0284c7' },
  { name: 'Cursos', scope: 'PROFISSIONAL', color: '#6366f1' },
  { name: 'Livros', scope: 'PROFISSIONAL', color: '#8b5cf6' },
  { name: 'Equipamentos', scope: 'PROFISSIONAL', color: '#14b8a6' },
  { name: 'Contabilidade', scope: 'PROFISSIONAL', color: '#22c55e' },
  { name: 'Tributos', scope: 'PROFISSIONAL', isTax: true, color: '#ef4444' },
  { name: 'Deslocamento profissional', scope: 'PROFISSIONAL', color: '#3b82f6' },
  { name: 'Funcionários e serviços', scope: 'PROFISSIONAL', color: '#f59e0b' },
  { name: 'Outras (profissionais)', scope: 'PROFISSIONAL', color: '#94a3b8' },
];

export interface Installment {
  number: number;
  count: number;
  amount: string;
  date: ISODate;
}

/** Parcela um valor mensalmente; as parcelas somam exatamente o total. */
export function buildInstallments(total: MoneyInput, count: number, firstDate: ISODate): Installment[] {
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('Número de parcelas deve estar entre 1 e 120');
  return splitEvenly(total, count).map((amount, i) => ({
    number: i + 1,
    count,
    amount: toMoneyString(amount),
    date: addMonths(firstDate, i),
  }));
}

export interface CreditCardRule {
  closingDay: number;
  dueDay: number;
}

/**
 * Fatura em que uma compra cai. Compras no dia do fechamento ou depois
 * entram na fatura seguinte. Retorna o mês de referência (= mês do vencimento).
 */
export function cardInvoiceFor(purchaseDate: ISODate, card: CreditCardRule): { reference: YearMonth; closingDate: ISODate; dueDate: ISODate } {
  const d = Number(purchaseDate.slice(8, 10));
  const closingMonth = d < card.closingDay ? `${yearMonthOf(purchaseDate)}-01` : addMonths(`${yearMonthOf(purchaseDate)}-01`, 1);
  const [cy, cm] = closingMonth.split('-').map(Number) as [number, number];
  const closingDate = dateFromParts(cy, cm, card.closingDay);
  // Vencimento após o fechamento no mesmo mês, ou no mês seguinte
  const dueMonth = card.dueDay > card.closingDay ? closingMonth : addMonths(closingMonth, 1);
  const [dy, dm] = dueMonth.split('-').map(Number) as [number, number];
  const dueDate = dateFromParts(dy, dm, card.dueDay);
  return { reference: yearMonthOf(dueDate), closingDate, dueDate };
}

/** Chave única de fatura para pagamento de fatura (evita contabilizar duas vezes). */
export function invoiceKey(cardId: string, reference: YearMonth): string {
  return `invoice:${cardId}:${reference}`;
}
