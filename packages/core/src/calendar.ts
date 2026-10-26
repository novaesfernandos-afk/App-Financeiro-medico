import type { ISODate } from './dates';
import { money, sum, toMoneyString } from './money';
import type { LedgerItem } from './ledger';
import { cashBalance, type OpeningBalance } from './dashboard';

/**
 * Skill `financial-calendar`. Um plantão gera DOIS eventos:
 * trabalho (na data de realização) e entrada financeira (na data de pagamento).
 */
export const CALENDAR_CATEGORIES = [
  'PLANTAO_AGENDADO', 'PLANTAO_REALIZADO', 'RECEBIMENTO_PREVISTO', 'RECEBIMENTO_REALIZADO',
  'RECEBIMENTO_ATRASADO', 'SALARIO', 'CONTA_A_PAGAR', 'CONTA_PAGA', 'IMPOSTO', 'FATURA', 'COMPRA_CARTAO',
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export interface CalendarEvent {
  id: string;
  ledgerKey: string;
  date: ISODate;
  category: CalendarCategory;
  title: string;
  amount: string | null;
  direction: 'IN' | 'OUT' | 'WORK';
  startTime: string | null;
  endTime: string | null;
  status: string;
  certainty: string;
  institutionId: string | null;
}

function moneyCategory(i: LedgerItem): CalendarCategory {
  if (i.direction === 'IN') {
    if (i.cashStatus === 'OVERDUE') return 'RECEBIMENTO_ATRASADO';
    if (i.source === 'SALARY' && i.cashStatus !== 'DONE') return 'SALARIO';
    return i.cashStatus === 'DONE' ? 'RECEBIMENTO_REALIZADO' : 'RECEBIMENTO_PREVISTO';
  }
  if (i.source === 'CARD_INVOICE') return 'FATURA';
  if (i.isTax) return 'IMPOSTO';
  return i.cashStatus === 'DONE' ? 'CONTA_PAGA' : 'CONTA_A_PAGAR';
}

export function buildCalendarEvents(ledger: LedgerItem[], from: ISODate, to: ISODate): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const inRange = (d: ISODate) => d >= from && d <= to;
  for (const i of ledger) {
    if (i.cashStatus === 'CANCELLED') continue;
    if (i.source === 'SHIFT' && i.workDate && inRange(i.workDate)) {
      events.push({
        id: `${i.key}:work`,
        ledgerKey: i.key,
        date: i.workDate,
        category: i.recordStatus === 'AGENDADO' ? 'PLANTAO_AGENDADO' : 'PLANTAO_REALIZADO',
        title: i.title,
        amount: i.gross,
        direction: 'WORK',
        startTime: i.startTime,
        endTime: i.endTime,
        status: i.recordStatus,
        certainty: i.certainty,
        institutionId: i.institutionId,
      });
    }
    if (i.source === 'EXPENSE' && !i.affectsCash) {
      if (inRange(i.competenceDate)) {
        events.push({
          id: `${i.key}:purchase`, ledgerKey: i.key, date: i.competenceDate, category: 'COMPRA_CARTAO',
          title: i.title, amount: i.net, direction: 'OUT', startTime: null, endTime: null,
          status: i.recordStatus, certainty: i.certainty, institutionId: null,
        });
      }
      continue;
    }
    if (inRange(i.cashDate)) {
      events.push({
        id: `${i.key}:cash`,
        ledgerKey: i.key,
        date: i.cashDate,
        category: moneyCategory(i),
        title: i.title,
        amount: i.net,
        direction: i.direction,
        startTime: null,
        endTime: null,
        status: i.recordStatus,
        certainty: i.certainty,
        institutionId: i.institutionId,
      });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

export interface DaySummary {
  date: ISODate;
  grossIn: string;
  netIn: string;
  expenses: string;
  projectedBalance: string | null;
  shiftsDone: number;
  shiftsScheduled: number;
  events: CalendarEvent[];
}

export function daySummary(ledger: LedgerItem[], date: ISODate, openings: OpeningBalance[]): DaySummary {
  const events = buildCalendarEvents(ledger, date, date);
  const cashIn = ledger.filter((i) => i.direction === 'IN' && i.cashStatus !== 'CANCELLED' && i.cashDate === date);
  const cashOut = ledger.filter((i) => i.direction === 'OUT' && i.affectsCash && i.cashStatus !== 'CANCELLED' && i.cashDate === date);
  return {
    date,
    grossIn: toMoneyString(sum(cashIn.map((i) => i.gross))),
    netIn: toMoneyString(sum(cashIn.map((i) => i.net))),
    expenses: toMoneyString(sum(cashOut.map((i) => money(i.net)))),
    projectedBalance: cashBalance(ledger, openings, date, true),
    shiftsDone: events.filter((e) => e.category === 'PLANTAO_REALIZADO').length,
    shiftsScheduled: events.filter((e) => e.category === 'PLANTAO_AGENDADO').length,
    events,
  };
}
