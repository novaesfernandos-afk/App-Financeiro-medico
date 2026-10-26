import { addMonthsYM, type ISODate, monthRange, type YearMonth, yearMonthOf } from './dates';
import { Decimal, money, sum, toMoneyString } from './money';
import type { Certainty, LedgerItem, Modality } from './ledger';

/** Painel executivo — derivado exclusivamente do ledger. */

export interface DashboardFilters {
  institutionIds?: string[];
  modalities?: Modality[];
}

export interface OpeningBalance {
  amount: string;
  date: ISODate;
}

export interface Breakdown {
  id: string;
  gross: string;
  net: string;
  tax: string;
  hours: string;
  netPerHour: string | null;
  count: number;
}

export interface MonthPoint {
  month: YearMonth;
  gross: string;
  net: string;
  received: string;
  expenses: string;
}

export interface Dashboard {
  month: YearMonth;
  today: ISODate;
  kpis: {
    grossRevenue: string;
    netRevenue: string;
    netRevenueByCertainty: Record<Certainty, string>;
    receivedRevenue: string;
    expenses: string;
    expensesPaid: string;
    taxesProvisioned: string;
    taxesWithheld: string;
    taxesPaid: string;
    availableBalance: string | null;
    /** Disponível na Fase 3 (módulo de investimentos). */
    investmentsMonth: null;
    netWorth: null;
    receivables: string;
    receivablesOverdue: string;
    payables: string;
    payablesOverdue: string;
    hoursWorked: string;
    netPerHour: string | null;
    shiftsDone: number;
    shiftsScheduled: number;
    entriesWithoutTax: number;
  };
  byInstitution: Breakdown[];
  byModality: Breakdown[];
  expensesByCategory: { id: string; amount: string }[];
  last12: MonthPoint[];
  forecast: { month: YearMonth; expectedIn: string; expectedOut: string; balance: string }[];
}

const inMonth = (d: ISODate, ym: YearMonth) => yearMonthOf(d) === ym;
const active = (i: LedgerItem) => i.cashStatus !== 'CANCELLED';

export function applyFilters(ledger: LedgerItem[], f: DashboardFilters = {}): LedgerItem[] {
  return ledger.filter((i) => {
    if (i.direction === 'OUT') return true; // filtros de receita não se aplicam a despesas
    if (f.institutionIds?.length && !f.institutionIds.includes(i.institutionId ?? '')) return false;
    if (f.modalities?.length && !f.modalities.includes(i.modality ?? 'AVULSO')) return false;
    return true;
  });
}

function breakdown(items: LedgerItem[], keyOf: (i: LedgerItem) => string): Breakdown[] {
  const groups = new Map<string, LedgerItem[]>();
  for (const i of items) {
    const k = keyOf(i);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups.entries()]
    .map(([id, list]) => {
      const hours = sum(list.map((i) => i.hours));
      const net = sum(list.map((i) => i.net));
      const netWithHours = sum(list.filter((i) => i.hours).map((i) => i.net));
      return {
        id,
        gross: toMoneyString(sum(list.map((i) => i.gross))),
        net: toMoneyString(net),
        tax: toMoneyString(sum(list.map((i) => i.tax))),
        hours: hours.toFixed(2),
        netPerHour: hours.isZero() ? null : toMoneyString(netWithHours.dividedBy(hours)),
        count: list.length,
      };
    })
    .sort((a, b) => money(b.gross).comparedTo(money(a.gross)));
}

/**
 * Saldo de caixa (previsto se includePending) até a data, a partir dos saldos iniciais.
 * O saldo inicial vale para o INÍCIO do dia de referência: lançamentos nessa data já contam.
 */
export function cashBalance(ledger: LedgerItem[], openings: OpeningBalance[], until: ISODate, includePending: boolean): string | null {
  if (openings.length === 0) return null;
  const baseline = openings.map((o) => o.date).sort().at(-1)!;
  let total = sum(openings.map((o) => o.amount));
  for (const i of ledger) {
    if (!i.affectsCash || !active(i)) continue;
    if (i.cashDate < baseline || i.cashDate > until) continue;
    if (!includePending && i.cashStatus !== 'DONE') continue;
    total = i.direction === 'IN' ? total.plus(money(i.net)) : total.minus(money(i.net));
  }
  return toMoneyString(total);
}

export function computeDashboard(params: {
  ledger: LedgerItem[];
  month: YearMonth;
  today: ISODate;
  openings: OpeningBalance[];
  filters?: DashboardFilters;
}): Dashboard {
  const { month, today, openings } = params;
  const ledger = applyFilters(params.ledger, params.filters).filter(active);
  const incomeComp = ledger.filter((i) => i.direction === 'IN' && inMonth(i.competenceDate, month));
  const consumption = ledger.filter((i) => i.isConsumption && inMonth(i.competenceDate, month));
  const cashOutMonth = ledger.filter((i) => i.direction === 'OUT' && i.affectsCash && inMonth(i.cashDate, month));

  const byCertainty = (c: Certainty) => toMoneyString(sum(incomeComp.filter((i) => i.certainty === c).map((i) => i.net)));
  const receivedMonth = ledger.filter((i) => i.direction === 'IN' && i.cashStatus === 'DONE' && inMonth(i.cashDate, month));
  const pendingIn = ledger.filter((i) => i.direction === 'IN' && i.cashStatus !== 'DONE' && i.certainty === 'ESTIMATED');
  const pendingOut = ledger.filter((i) => i.direction === 'OUT' && i.affectsCash && i.cashStatus !== 'DONE');
  const shifts = incomeComp.filter((i) => i.source === 'SHIFT');
  const hours = sum(incomeComp.map((i) => i.hours));
  const netWithHours = sum(incomeComp.filter((i) => i.hours).map((i) => i.net));

  const expByCat = new Map<string, Decimal>();
  for (const e of consumption) {
    const k = e.expenseCategoryId ?? 'sem-categoria';
    expByCat.set(k, (expByCat.get(k) ?? new Decimal(0)).plus(money(e.net)));
  }

  const last12: MonthPoint[] = [];
  for (let k = 11; k >= 0; k--) {
    const ym = addMonthsYM(month, -k);
    last12.push({
      month: ym,
      gross: toMoneyString(sum(ledger.filter((i) => i.direction === 'IN' && inMonth(i.competenceDate, ym)).map((i) => i.gross))),
      net: toMoneyString(sum(ledger.filter((i) => i.direction === 'IN' && inMonth(i.competenceDate, ym)).map((i) => i.net))),
      received: toMoneyString(sum(ledger.filter((i) => i.direction === 'IN' && i.cashStatus === 'DONE' && inMonth(i.cashDate, ym)).map((i) => i.net))),
      expenses: toMoneyString(sum(ledger.filter((i) => i.isConsumption && inMonth(i.competenceDate, ym)).map((i) => i.net))),
    });
  }

  const forecast = [1, 2, 3].map((k) => {
    const ym = addMonthsYM(yearMonthOf(today), k - 1);
    const { end } = monthRange(ym);
    const cashIn = ledger.filter((i) => i.direction === 'IN' && i.cashStatus !== 'DONE' && inMonth(i.cashDate, ym));
    const cashOut = ledger.filter((i) => i.direction === 'OUT' && i.affectsCash && i.cashStatus !== 'DONE' && inMonth(i.cashDate, ym));
    return {
      month: ym,
      expectedIn: toMoneyString(sum(cashIn.map((i) => i.net))),
      expectedOut: toMoneyString(sum(cashOut.map((i) => i.net))),
      balance: cashBalance(ledger, openings, end, true) ?? toMoneyString(sum(cashIn.map((i) => i.net)).minus(sum(cashOut.map((i) => i.net)))),
    };
  });

  return {
    month,
    today,
    kpis: {
      grossRevenue: toMoneyString(sum(incomeComp.map((i) => i.gross))),
      netRevenue: toMoneyString(sum(incomeComp.map((i) => i.net))),
      netRevenueByCertainty: { REAL: byCertainty('REAL'), ESTIMATED: byCertainty('ESTIMATED'), PROJECTED: byCertainty('PROJECTED') },
      receivedRevenue: toMoneyString(sum(receivedMonth.map((i) => i.net))),
      expenses: toMoneyString(sum(consumption.map((i) => i.net))),
      expensesPaid: toMoneyString(sum(cashOutMonth.filter((i) => i.cashStatus === 'DONE').map((i) => i.net))),
      taxesProvisioned: toMoneyString(sum(incomeComp.map((i) => i.tax))),
      taxesWithheld: toMoneyString(sum(incomeComp.map((i) => i.taxWithheld))),
      taxesPaid: toMoneyString(sum(ledger.filter((i) => i.isTax && i.cashStatus === 'DONE' && inMonth(i.cashDate, month)).map((i) => i.net))),
      availableBalance: cashBalance(ledger, openings, today, false),
      investmentsMonth: null,
      netWorth: null,
      receivables: toMoneyString(sum(pendingIn.map((i) => i.net))),
      receivablesOverdue: toMoneyString(sum(pendingIn.filter((i) => i.cashStatus === 'OVERDUE').map((i) => i.net))),
      payables: toMoneyString(sum(pendingOut.map((i) => i.net))),
      payablesOverdue: toMoneyString(sum(pendingOut.filter((i) => i.cashStatus === 'OVERDUE').map((i) => i.net))),
      hoursWorked: hours.toFixed(2),
      netPerHour: hours.isZero() ? null : toMoneyString(netWithHours.dividedBy(hours)),
      shiftsDone: shifts.filter((i) => i.recordStatus !== 'AGENDADO').length,
      shiftsScheduled: shifts.filter((i) => i.recordStatus === 'AGENDADO').length,
      entriesWithoutTax: incomeComp.filter((i) => i.taxStatus === 'NOT_CONFIGURED').length,
    },
    byInstitution: breakdown(incomeComp, (i) => i.institutionId ?? 'sem-instituicao'),
    byModality: breakdown(incomeComp, (i) => i.modality ?? 'AVULSO'),
    expensesByCategory: [...expByCat.entries()]
      .map(([id, v]) => ({ id, amount: toMoneyString(v) }))
      .sort((a, b) => money(b.amount).comparedTo(money(a.amount))),
    last12,
    forecast,
  };
}
