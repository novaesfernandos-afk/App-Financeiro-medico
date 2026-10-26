import { addMonthsYM, type ISODate, type YearMonth, yearMonthOf } from './dates';
import { cardInvoiceFor, invoiceKey, type ExpenseScope, type PaymentMethod } from './expenses';
import { money, sum, toMoneyString } from './money';
import { projectSalaryOccurrences, type ContractType, type FixedContractInput } from './salary';
import {
  computeShiftValues, effectiveShiftStatus, shiftDurationMinutes,
  type PricingMode, type ShiftStatus, type ShiftType,
} from './shifts';
import { resolveTax, type TaxComponent, type TaxProfile, type TaxStatus } from './tax';

/**
 * Livro-razão unificado: a ÚNICA camada que transforma registros do banco em
 * fatos financeiros. Dashboard, calendário, relatórios e agentes de IA
 * consomem este ledger — garantindo que todos usem exatamente os mesmos números.
 *
 * Distinções fundamentais:
 *  - competenceDate: quando o trabalho/consumo ocorreu (regime de competência)
 *  - cashDate: quando o dinheiro entra/sai (previsto ou efetivo — regime de caixa)
 *  - certainty: REAL (efetivado), ESTIMATED (devido, ainda não liquidado), PROJECTED (futuro/agendado)
 *  - affectsCash / isConsumption: compras no cartão são consumo na data da compra,
 *    mas o caixa só é afetado no pagamento da fatura (sem dupla contagem).
 */

export const INCOME_CATEGORIES = [
  'CONSULTA', 'PROCEDIMENTO', 'CIRURGIA', 'AULA_PRECEPTORIA', 'PARECER', 'TELEMEDICINA',
  'BONIFICACAO', 'DISTRIBUICAO_LUCROS', 'PRO_LABORE', 'RENDIMENTO', 'OUTRA',
] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export type LedgerSource = 'SHIFT' | 'SALARY' | 'INCOME' | 'EXPENSE' | 'CARD_INVOICE';
export type Certainty = 'REAL' | 'ESTIMATED' | 'PROJECTED';
export type CashStatus = 'PENDING' | 'DONE' | 'OVERDUE' | 'CANCELLED';
export type Modality = ContractType | 'AVULSO';

export interface LedgerItem {
  key: string;
  source: LedgerSource;
  direction: 'IN' | 'OUT';
  refId: string;
  title: string;
  workDate: ISODate | null;
  competenceDate: ISODate;
  cashDate: ISODate;
  cashStatus: CashStatus;
  certainty: Certainty;
  /** Status original do registro (ex.: status do plantão). */
  recordStatus: string;
  gross: string;
  tax: string;
  taxWithheld: string;
  taxStatus: TaxStatus | null;
  deductions: string;
  net: string;
  affectsCash: boolean;
  isConsumption: boolean;
  institutionId: string | null;
  contractId: string | null;
  modality: Modality | null;
  incomeCategory: IncomeCategory | 'PLANTAO' | 'SALARIO' | null;
  expenseCategoryId: string | null;
  scope: ExpenseScope | null;
  isTax: boolean;
  hours: string | null;
  shiftType: ShiftType | null;
  startTime: string | null;
  endTime: string | null;
  /** Explica a origem do número (rastreabilidade para auditoria e IA). */
  trace: string;
}

export interface ShiftRecord {
  id: string;
  institutionId: string;
  contractId: string | null;
  modality: ContractType | null;
  unit?: string | null;
  label?: string | null;
  date: ISODate;
  startTime: string;
  endTime: string;
  type: ShiftType;
  status: ShiftStatus;
  pricingMode: PricingMode;
  amount: string;
  additionalPercent: string | null;
  bonuses: string | null;
  deductions: string | null;
  taxProfileId: string | null;
  taxOverride: TaxComponent[] | null;
  confirmedTax: string | null;
  expectedPaymentDate: ISODate;
  receivedDate: ISODate | null;
  receivedAmount: string | null;
}

export interface IncomeRecord {
  id: string;
  description: string;
  category: IncomeCategory;
  institutionId: string | null;
  contractId: string | null;
  modality: ContractType | null;
  competenceDate: ISODate;
  expectedPaymentDate: ISODate;
  grossAmount: string;
  deductions: string | null;
  taxProfileId: string | null;
  taxOverride: TaxComponent[] | null;
  confirmedTax: string | null;
  status: 'PREVISTO' | 'RECEBIDO' | 'CANCELADO';
  receivedDate: ISODate | null;
  receivedAmount: string | null;
  hours: string | null;
}

export interface SalaryPaymentRecord {
  contractId: string;
  competence: YearMonth;
  index: number;
  status: 'RECEBIDO' | 'CANCELADO';
  receivedDate: ISODate | null;
  receivedAmount: string | null;
  confirmedTax: string | null;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  amount: string;
  categoryId: string | null;
  scope: ExpenseScope;
  isTax: boolean;
  competenceDate: ISODate;
  dueDate: ISODate;
  paidDate: ISODate | null;
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
  paymentMethod: PaymentMethod;
  creditCardId: string | null;
  installmentNumber: number | null;
  installmentCount: number | null;
}

export interface CardRecord {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
}

export interface InvoicePaymentRecord {
  cardId: string;
  reference: YearMonth;
  paidDate: ISODate;
  amount: string;
}

export interface LedgerInput {
  from: ISODate;
  to: ISODate;
  today: ISODate;
  shifts: ShiftRecord[];
  contracts: (FixedContractInput & { taxProfileId?: string | null })[];
  salaryPayments: SalaryPaymentRecord[];
  incomes: IncomeRecord[];
  expenses: ExpenseRecord[];
  cards: CardRecord[];
  invoicePayments: InvoicePaymentRecord[];
  taxProfiles: Record<string, TaxProfile>;
}

function cashStatusFor(done: boolean, cancelled: boolean, cashDate: ISODate, today: ISODate): CashStatus {
  if (cancelled) return 'CANCELLED';
  if (done) return 'DONE';
  return cashDate < today ? 'OVERDUE' : 'PENDING';
}

const SHIFT_LABEL: Record<ShiftType, string> = {
  DIURNO: 'Plantão diurno',
  NOTURNO: 'Plantão noturno',
  FIM_DE_SEMANA: 'Plantão fim de semana',
  FERIADO: 'Plantão feriado',
  SOBREAVISO: 'Sobreaviso',
};

function shiftItem(s: ShiftRecord, input: LedgerInput): LedgerItem {
  const profile = s.taxProfileId ? input.taxProfiles[s.taxProfileId] ?? null : null;
  const values = computeShiftValues({
    date: s.date,
    durationMinutes: shiftDurationMinutes(s.startTime, s.endTime),
    pricingMode: s.pricingMode,
    amount: s.amount,
    additionalPercent: s.additionalPercent,
    bonuses: s.bonuses,
    deductions: s.deductions,
    taxProfile: profile,
    taxOverride: s.taxOverride,
    confirmedTax: s.confirmedTax,
  });
  const status = effectiveShiftStatus(s.status, s.expectedPaymentDate, input.today);
  const received = status === 'RECEBIDO';
  const cancelled = status === 'CANCELADO';
  const cashDate = received && s.receivedDate ? s.receivedDate : s.expectedPaymentDate;
  const net = received && s.receivedAmount ? toMoneyString(s.receivedAmount) : values.net;
  return {
    key: `shift:${s.id}`,
    source: 'SHIFT',
    direction: 'IN',
    refId: s.id,
    title: s.label || SHIFT_LABEL[s.type],
    workDate: s.date,
    competenceDate: s.date,
    cashDate,
    cashStatus: cashStatusFor(received, cancelled, cashDate, input.today),
    certainty: received ? 'REAL' : status === 'AGENDADO' ? 'PROJECTED' : 'ESTIMATED',
    recordStatus: status,
    gross: values.gross,
    tax: values.tax.total,
    taxWithheld: values.tax.withheld,
    taxStatus: values.tax.status,
    deductions: values.deductions,
    net,
    affectsCash: true,
    isConsumption: false,
    institutionId: s.institutionId,
    contractId: s.contractId,
    modality: s.modality ?? 'AVULSO',
    incomeCategory: 'PLANTAO',
    expenseCategoryId: null,
    scope: null,
    isTax: false,
    hours: values.hours,
    shiftType: s.type,
    startTime: s.startTime,
    endTime: s.endTime,
    trace: `Plantão ${s.date} ${s.startTime}-${s.endTime}: ${s.pricingMode === 'PER_HOUR' ? `${values.hours}h × ${s.amount}` : `valor ${s.amount}`}` +
      `${s.additionalPercent ? ` + ${s.additionalPercent}% adicional` : ''}${s.bonuses ? ` + bônus ${s.bonuses}` : ''}` +
      ` = bruto ${values.gross}; imposto ${values.tax.total} (${values.tax.status}); descontos ${values.deductions}; líquido ${net}${received ? ' (recebido)' : ''}`,
  };
}

function salaryItems(input: LedgerInput): LedgerItem[] {
  const fromYM = addMonthsYM(yearMonthOf(input.from), -1);
  const toYM = yearMonthOf(input.to);
  const currentYM = yearMonthOf(input.today);
  const payments = new Map(input.salaryPayments.map((p) => [`${p.contractId}:${p.competence}:${p.index}`, p]));
  const items: LedgerItem[] = [];
  for (const c of input.contracts) {
    const profile = c.taxProfile ?? (c.taxProfileId ? input.taxProfiles[c.taxProfileId] ?? null : null);
    for (const occ of projectSalaryOccurrences({ ...c, taxProfile: profile }, fromYM, toYM)) {
      const rec = payments.get(`${c.id}:${occ.competence}:${occ.index}`);
      const received = rec?.status === 'RECEBIDO';
      const cancelled = rec?.status === 'CANCELADO';
      const cashDate = received && rec?.receivedDate ? rec.receivedDate : occ.expectedDate;
      let tax = occ.tax.total;
      let taxStatus: TaxStatus = occ.tax.status;
      let withheld = occ.tax.withheld;
      if (rec?.confirmedTax) {
        tax = toMoneyString(rec.confirmedTax);
        taxStatus = 'CONFIRMED';
        withheld = tax;
      }
      const net = received && rec?.receivedAmount
        ? toMoneyString(rec.receivedAmount)
        : toMoneyString(money(occ.gross).minus(money(tax)).minus(money(occ.deductions)));
      items.push({
        key: occ.key,
        source: 'SALARY',
        direction: 'IN',
        refId: c.id,
        title: c.title,
        workDate: null,
        competenceDate: `${occ.competence}-01`,
        cashDate,
        cashStatus: cashStatusFor(received, cancelled, cashDate, input.today),
        certainty: received ? 'REAL' : occ.competence > currentYM ? 'PROJECTED' : 'ESTIMATED',
        recordStatus: received ? 'RECEBIDO' : cancelled ? 'CANCELADO' : 'PREVISTO',
        gross: occ.gross,
        tax,
        taxWithheld: withheld,
        taxStatus,
        deductions: occ.deductions,
        net,
        affectsCash: true,
        isConsumption: false,
        institutionId: c.institutionId,
        contractId: c.id,
        modality: c.type,
        incomeCategory: 'SALARIO',
        expenseCategoryId: null,
        scope: null,
        isTax: false,
        hours: null,
        shiftType: null,
        startTime: null,
        endTime: null,
        trace: `Vínculo "${c.title}" competência ${occ.competence} parcela ${occ.index + 1}: bruto ${occ.gross}; imposto ${tax} (${taxStatus}); descontos ${occ.deductions}; líquido ${net}`,
      });
    }
  }
  return items;
}

function incomeItem(r: IncomeRecord, input: LedgerInput): LedgerItem {
  const profile = r.taxProfileId ? input.taxProfiles[r.taxProfileId] ?? null : null;
  const tax = resolveTax({
    gross: r.grossAmount,
    date: r.competenceDate,
    profile,
    override: r.taxOverride,
    confirmedAmount: r.confirmedTax,
  });
  const received = r.status === 'RECEBIDO';
  const cancelled = r.status === 'CANCELADO';
  const cashDate = received && r.receivedDate ? r.receivedDate : r.expectedPaymentDate;
  const deductions = toMoneyString(r.deductions);
  const computedNet = toMoneyString(money(r.grossAmount).minus(money(tax.total)).minus(money(deductions)));
  const net = received && r.receivedAmount ? toMoneyString(r.receivedAmount) : computedNet;
  // Distribuição de lucros e pró-labore já são saídas da PJ: o faturamento da PJ
  // é registrado à parte; aqui entram como renda da PF (sem novo imposto da PJ).
  return {
    key: `income:${r.id}`,
    source: 'INCOME',
    direction: 'IN',
    refId: r.id,
    title: r.description,
    workDate: null,
    competenceDate: r.competenceDate,
    cashDate,
    cashStatus: cashStatusFor(received, cancelled, cashDate, input.today),
    certainty: received ? 'REAL' : r.competenceDate > input.today ? 'PROJECTED' : 'ESTIMATED',
    recordStatus: r.status,
    gross: toMoneyString(r.grossAmount),
    tax: tax.total,
    taxWithheld: tax.withheld,
    taxStatus: tax.status,
    deductions,
    net,
    affectsCash: true,
    isConsumption: false,
    institutionId: r.institutionId,
    contractId: r.contractId,
    modality: r.modality ?? 'AVULSO',
    incomeCategory: r.category,
    expenseCategoryId: null,
    scope: null,
    isTax: false,
    hours: r.hours,
    shiftType: null,
    startTime: null,
    endTime: null,
    trace: `Receita "${r.description}" (${r.category}) competência ${r.competenceDate}: bruto ${r.grossAmount}; imposto ${tax.total} (${tax.status}); líquido ${net}`,
  };
}

function expenseItem(e: ExpenseRecord, input: LedgerInput, cards: Map<string, CardRecord>, paidInvoices: Set<string>): LedgerItem {
  const card = e.creditCardId ? cards.get(e.creditCardId) : undefined;
  const onCard = e.paymentMethod === 'CARTAO_CREDITO' && card !== undefined;
  const cancelled = e.status === 'CANCELADO';
  let cashDate = e.status === 'PAGO' && e.paidDate ? e.paidDate : e.dueDate;
  let done = e.status === 'PAGO';
  if (onCard) {
    const inv = cardInvoiceFor(e.competenceDate, card);
    cashDate = inv.dueDate;
    done = paidInvoices.has(invoiceKey(card.id, inv.reference));
  }
  const amount = toMoneyString(e.amount);
  return {
    key: `expense:${e.id}`,
    source: 'EXPENSE',
    direction: 'OUT',
    refId: e.id,
    title: e.installmentCount && e.installmentCount > 1 ? `${e.description} (${e.installmentNumber}/${e.installmentCount})` : e.description,
    workDate: null,
    competenceDate: e.competenceDate,
    cashDate,
    cashStatus: cashStatusFor(done, cancelled, cashDate, input.today),
    certainty: done ? 'REAL' : e.competenceDate > input.today ? 'PROJECTED' : 'ESTIMATED',
    recordStatus: e.status,
    gross: amount,
    tax: '0.00',
    taxWithheld: '0.00',
    taxStatus: null,
    deductions: '0.00',
    net: amount,
    affectsCash: !onCard,
    isConsumption: true,
    institutionId: null,
    contractId: null,
    modality: null,
    incomeCategory: null,
    expenseCategoryId: e.categoryId,
    scope: e.scope,
    isTax: e.isTax,
    hours: null,
    shiftType: null,
    startTime: null,
    endTime: null,
    trace: onCard
      ? `Compra no cartão "${card.name}" em ${e.competenceDate}: ${amount} — consumo na data da compra; caixa afetado só pela fatura`
      : `Despesa "${e.description}" ${amount}, vencimento ${e.dueDate}${done ? `, paga em ${cashDate}` : ''}`,
  };
}

function invoiceItems(expenseItems: LedgerItem[], expenses: ExpenseRecord[], input: LedgerInput, cards: Map<string, CardRecord>): LedgerItem[] {
  const groups = new Map<string, { card: CardRecord; reference: YearMonth; dueDate: ISODate; amounts: string[] }>();
  expenses.forEach((e, i) => {
    const item = expenseItems[i]!;
    if (item.affectsCash || item.cashStatus === 'CANCELLED' || !e.creditCardId) return;
    const card = cards.get(e.creditCardId)!;
    const inv = cardInvoiceFor(e.competenceDate, card);
    const k = invoiceKey(card.id, inv.reference);
    const g = groups.get(k) ?? { card, reference: inv.reference, dueDate: inv.dueDate, amounts: [] };
    g.amounts.push(e.amount);
    groups.set(k, g);
  });
  const payments = new Map(input.invoicePayments.map((p) => [invoiceKey(p.cardId, p.reference), p]));
  // Faturas pagas sem compras lançadas também aparecem (pagamento informado)
  for (const [k, p] of payments) {
    const card = cards.get(p.cardId);
    if (!groups.has(k) && card) groups.set(k, { card, reference: p.reference, dueDate: p.paidDate, amounts: [] });
  }
  return [...groups.entries()].map(([k, g]) => {
    const pay = payments.get(k);
    const computed = toMoneyString(sum(g.amounts));
    const amount = pay ? toMoneyString(pay.amount) : computed;
    const cashDate = pay ? pay.paidDate : g.dueDate;
    return {
      key: k,
      source: 'CARD_INVOICE' as const,
      direction: 'OUT' as const,
      refId: g.card.id,
      title: `Fatura ${g.card.name} ${g.reference}`,
      workDate: null,
      competenceDate: g.dueDate,
      cashDate,
      cashStatus: cashStatusFor(Boolean(pay), false, cashDate, input.today),
      certainty: pay ? 'REAL' as const : 'ESTIMATED' as const,
      recordStatus: pay ? 'PAGA' : 'ABERTA',
      gross: amount,
      tax: '0.00',
      taxWithheld: '0.00',
      taxStatus: null,
      deductions: '0.00',
      net: amount,
      affectsCash: true,
      isConsumption: false,
      institutionId: null,
      contractId: null,
      modality: null,
      incomeCategory: null,
      expenseCategoryId: null,
      scope: null,
      isTax: false,
      hours: null,
      shiftType: null,
      startTime: null,
      endTime: null,
      trace: `Fatura ${g.card.name} ${g.reference}: soma de ${g.amounts.length} compra(s) = ${computed}${pay ? `; paga ${amount} em ${pay.paidDate}` : ''}. Transferência de caixa — não é nova despesa.`,
    };
  });
}

export function buildLedger(input: LedgerInput): LedgerItem[] {
  const cards = new Map(input.cards.map((c) => [c.id, c]));
  const paidInvoices = new Set(input.invoicePayments.map((p) => invoiceKey(p.cardId, p.reference)));
  const expenseItems = input.expenses.map((e) => expenseItem(e, input, cards, paidInvoices));
  const items = [
    ...input.shifts.map((s) => shiftItem(s, input)),
    ...salaryItems(input),
    ...input.incomes.map((r) => incomeItem(r, input)),
    ...expenseItems,
    ...invoiceItems(expenseItems, input.expenses, input, cards),
  ];
  // Chaves únicas garantem ausência de duplicidade
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
