import { addDays, addMonths, assertISODate, dateFromParts, diffDays, type ISODate, weekday } from './dates';

/**
 * Expansão de recorrências (plantões fixos, escalas quinzenais, 12x36 etc.).
 * Gera uma lista ordenada e sem repetições de datas — a persistência usa a
 * chave única (série, data) para garantir que reprocessar a série nunca
 * duplique plantões.
 */
export type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'EVERY_N_DAYS' | 'MONTHLY';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  startDate: ISODate;
  until: ISODate;
  /** WEEKLY/BIWEEKLY: 0=domingo..6=sábado */
  weekdays?: number[];
  /** EVERY_N_DAYS: intervalo em dias (ex.: 2 para dia sim/dia não) */
  interval?: number;
  /** MONTHLY: dias do mês */
  monthDays?: number[];
  /** Datas a pular (férias, trocas de plantão) */
  exceptions?: ISODate[];
}

export const MAX_OCCURRENCES = 500;

export class RecurrenceError extends Error {}

export function expandRecurrence(rule: RecurrenceRule): ISODate[] {
  assertISODate(rule.startDate);
  assertISODate(rule.until);
  if (rule.until < rule.startDate) throw new RecurrenceError('Data final anterior à inicial');
  if (diffDays(rule.startDate, rule.until) > 3 * 366) throw new RecurrenceError('Recorrência limitada a 3 anos');
  const exceptions = new Set(rule.exceptions ?? []);
  const out = new Set<ISODate>();

  switch (rule.frequency) {
    case 'WEEKLY':
    case 'BIWEEKLY': {
      const days = new Set(rule.weekdays ?? []);
      if (days.size === 0 || [...days].some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new RecurrenceError('Informe os dias da semana (0–6)');
      }
      const step = rule.frequency === 'WEEKLY' ? 1 : 2;
      // Semana âncora: domingo da semana da data inicial
      const anchor = addDays(rule.startDate, -weekday(rule.startDate));
      for (let d = rule.startDate; d <= rule.until; d = addDays(d, 1)) {
        const weekIndex = Math.floor(diffDays(anchor, d) / 7);
        if (weekIndex % step === 0 && days.has(weekday(d))) out.add(d);
      }
      break;
    }
    case 'EVERY_N_DAYS': {
      const n = rule.interval ?? 0;
      if (!Number.isInteger(n) || n < 1) throw new RecurrenceError('Intervalo em dias inválido');
      for (let d = rule.startDate; d <= rule.until; d = addDays(d, n)) out.add(d);
      break;
    }
    case 'MONTHLY': {
      const monthDays = rule.monthDays ?? [];
      if (monthDays.length === 0 || monthDays.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
        throw new RecurrenceError('Informe os dias do mês (1–31)');
      }
      for (let m = rule.startDate.slice(0, 7) + '-01'; m <= rule.until; m = addMonths(m, 1)) {
        const [y, mo] = m.split('-').map(Number) as [number, number];
        for (const day of monthDays) {
          const d = dateFromParts(y, mo, day);
          if (d >= rule.startDate && d <= rule.until) out.add(d);
        }
      }
      break;
    }
    default:
      throw new RecurrenceError(`Frequência inválida: ${String(rule.frequency)}`);
  }

  const result = [...out].filter((d) => !exceptions.has(d)).sort();
  if (result.length > MAX_OCCURRENCES) throw new RecurrenceError(`Recorrência gera mais de ${MAX_OCCURRENCES} ocorrências`);
  return result;
}
