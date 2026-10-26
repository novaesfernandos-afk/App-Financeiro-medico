import { addDays, addMonths, dateFromParts, type ISODate, weekday } from './dates';
import { Decimal, money, percentOf, round2, toMoneyString, type MoneyInput } from './money';
import { resolveTax, type TaxComponent, type TaxProfile, type TaxResult } from './tax';

/** Skill `shift-calculator`: duração, valores e datas de pagamento de plantões. */

export const SHIFT_TYPES = ['DIURNO', 'NOTURNO', 'FIM_DE_SEMANA', 'FERIADO', 'SOBREAVISO'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const SHIFT_STATUSES = [
  'AGENDADO', 'REALIZADO', 'FATURADO', 'A_RECEBER', 'RECEBIDO', 'ATRASADO', 'CANCELADO',
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export type PricingMode = 'PER_SHIFT' | 'PER_HOUR';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function shiftDurationMinutes(start: string, end: string): number {
  const s = TIME_RE.exec(start);
  const e = TIME_RE.exec(end);
  if (!s || !e) throw new Error('Horário inválido (use HH:MM)');
  const sm = Number(s[1]) * 60 + Number(s[2]);
  const em = Number(e[1]) * 60 + Number(e[2]);
  // Término <= início significa virada de dia (ex.: 19:00–07:00 = 12h; 07:00–07:00 = 24h)
  return em > sm ? em - sm : em + 24 * 60 - sm;
}

export interface ShiftPricing {
  pricingMode: PricingMode;
  /** Valor por plantão (PER_SHIFT) ou por hora (PER_HOUR). */
  amount: MoneyInput;
  /** Adicional noturno/feriado em % sobre o valor base. */
  additionalPercent?: MoneyInput;
  bonuses?: MoneyInput;
  /** Descontos após impostos (taxa de cooperativa, glosas etc.). */
  deductions?: MoneyInput;
}

export interface ShiftValueInput extends ShiftPricing {
  date: ISODate;
  durationMinutes: number;
  taxProfile?: TaxProfile | null;
  taxOverride?: TaxComponent[] | null;
  confirmedTax?: MoneyInput;
}

export interface ShiftValues {
  hours: string;
  base: string;
  additional: string;
  bonuses: string;
  gross: string;
  tax: TaxResult;
  deductions: string;
  net: string;
  grossPerHour: string;
  netPerHour: string;
}

/**
 * bruto = base + adicional% sobre a base + bonificações
 * líquido = bruto − impostos − descontos
 */
export function computeShiftValues(input: ShiftValueInput): ShiftValues {
  if (input.durationMinutes <= 0) throw new Error('Duração do plantão deve ser positiva');
  const hours = new Decimal(input.durationMinutes).dividedBy(60);
  const base = input.pricingMode === 'PER_HOUR' ? money(input.amount).times(hours) : money(input.amount);
  const additional = percentOf(base, input.additionalPercent);
  const bonuses = money(input.bonuses);
  const gross = round2(base.plus(additional).plus(bonuses));
  const tax = resolveTax({
    gross,
    date: input.date,
    profile: input.taxProfile,
    override: input.taxOverride,
    confirmedAmount: input.confirmedTax,
  });
  const deductions = round2(input.deductions);
  const net = gross.minus(money(tax.total)).minus(deductions);
  return {
    hours: hours.toFixed(2),
    base: toMoneyString(base),
    additional: toMoneyString(additional),
    bonuses: toMoneyString(bonuses),
    gross: toMoneyString(gross),
    tax,
    deductions: toMoneyString(deductions),
    net: toMoneyString(net),
    grossPerHour: toMoneyString(gross.dividedBy(hours)),
    netPerHour: toMoneyString(net.dividedBy(hours)),
  };
}

export interface ShiftRate {
  shiftType: ShiftType;
  /** Dia da semana específico (0–6) ou null para qualquer dia. */
  weekday: number | null;
  pricingMode: PricingMode;
  amount: string;
  additionalPercent?: string | null;
}

/** Tabela de valores por instituição/vínculo: regra do dia da semana tem prioridade. */
export function resolveShiftRate(rates: ShiftRate[], type: ShiftType, date: ISODate): ShiftRate | null {
  const wd = weekday(date);
  return (
    rates.find((r) => r.shiftType === type && r.weekday === wd) ??
    rates.find((r) => r.shiftType === type && r.weekday === null) ??
    null
  );
}

export type PaymentRule =
  | { mode: 'DAYS_AFTER'; days: number }
  | { mode: 'MONTH_DAY'; day: number; monthsAfter: number };

/** Data prevista de pagamento a partir da data de realização. */
export function expectedPaymentDate(workDate: ISODate, rule: PaymentRule | null | undefined): ISODate {
  if (!rule) return workDate;
  if (rule.mode === 'DAYS_AFTER') return addDays(workDate, Math.max(0, rule.days));
  const target = addMonths(`${workDate.slice(0, 7)}-01`, Math.max(0, rule.monthsAfter));
  const [y, m] = target.split('-').map(Number) as [number, number];
  return dateFromParts(y, m, rule.day);
}

const AWAITING: ShiftStatus[] = ['REALIZADO', 'FATURADO', 'A_RECEBER', 'ATRASADO'];

/** Status efetivo: plantão trabalhado e não recebido após a data prevista => ATRASADO. */
export function effectiveShiftStatus(status: ShiftStatus, expectedPayment: ISODate, today: ISODate): ShiftStatus {
  if (AWAITING.includes(status) && expectedPayment < today) return 'ATRASADO';
  if (status === 'ATRASADO' && expectedPayment >= today) return 'A_RECEBER';
  return status;
}
