import Decimal from 'decimal.js';

/**
 * Toda aritmética monetária do sistema passa por aqui.
 * Valores trafegam como string decimal ("1234.56") entre camadas e são
 * operados com Decimal — nunca com ponto flutuante.
 */
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = string | number | Decimal | null | undefined;
export { Decimal };

export function money(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor monetário inválido: ${value}`);
    // Converte via string para não herdar artefatos binários do float
    return new Decimal(value.toString());
  }
  const normalized = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new Error(`Valor monetário inválido: "${value}"`);
  return new Decimal(normalized);
}

/** Arredonda para centavos (meio-par, padrão bancário). */
export function round2(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Serializa para string com 2 casas — formato de transporte da API. */
export function toMoneyString(value: MoneyInput): string {
  return round2(value).toFixed(2);
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0));
}

/** Percentual expresso como "11.5" (=11,5%). */
export function percentOf(base: MoneyInput, percent: MoneyInput): Decimal {
  return money(base).times(money(percent)).dividedBy(100);
}

/**
 * Divide um valor em N partes que somam exatamente o total
 * (centavos residuais vão para as primeiras parcelas).
 */
export function splitEvenly(total: MoneyInput, parts: number): Decimal[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error('Número de partes inválido');
  const cents = round2(total).times(100);
  const base = cents.dividedToIntegerBy(parts);
  const remainder = cents.minus(base.times(parts)).toNumber();
  return Array.from({ length: parts }, (_, i) =>
    base.plus(i < Math.abs(remainder) ? Math.sign(remainder) : 0).dividedBy(100),
  );
}

export function formatBRL(value: MoneyInput): string {
  const n = round2(value).toNumber();
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
