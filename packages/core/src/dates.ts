/**
 * Datas financeiras são "datas de calendário" (YYYY-MM-DD), sem fuso.
 * Internamente usamos Date em UTC apenas para aritmética.
 */
export type ISODate = string; // YYYY-MM-DD
export type YearMonth = string; // YYYY-MM

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertISODate(d: string): ISODate {
  if (!ISO_RE.test(d)) throw new Error(`Data inválida: "${d}" (esperado YYYY-MM-DD)`);
  const parsed = parseISODate(d);
  if (formatISODate(parsed) !== d) throw new Error(`Data inexistente: "${d}"`);
  return d;
}

export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}

export function formatISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function toISODate(value: Date | string): ISODate {
  if (typeof value === 'string') return value.slice(0, 10);
  return formatISODate(value);
}

export function addDays(d: ISODate, days: number): ISODate {
  const dt = parseISODate(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatISODate(dt);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Soma meses mantendo o dia (limitado ao último dia do mês). */
export function addMonths(d: ISODate, months: number): ISODate {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return dateFromParts(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function dateFromParts(year: number, month1: number, day: number): ISODate {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

export function yearMonthOf(d: ISODate): YearMonth {
  return d.slice(0, 7);
}

export function monthRange(ym: YearMonth): { start: ISODate; end: ISODate } {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { start: dateFromParts(y, m, 1), end: dateFromParts(y, m, daysInMonth(y, m)) };
}

export function addMonthsYM(ym: YearMonth, months: number): YearMonth {
  return yearMonthOf(addMonths(`${ym}-01`, months));
}

export function monthsBetween(startYM: YearMonth, endYM: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  let cur = startYM;
  while (cur <= endYM) {
    out.push(cur);
    cur = addMonthsYM(cur, 1);
  }
  return out;
}

/** 0 = domingo ... 6 = sábado */
export function weekday(d: ISODate): number {
  return parseISODate(d).getUTCDay();
}

export function isWithin(d: ISODate, start: ISODate, end: ISODate): boolean {
  return d >= start && d <= end;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function todayISO(now: Date = new Date()): ISODate {
  // Data local do usuário (America/Sao_Paulo por padrão no servidor)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}
