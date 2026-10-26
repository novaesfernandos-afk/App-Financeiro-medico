import { describe, expect, it } from 'vitest';
import { addMonths, assertISODate, expandRecurrence, money, splitEvenly, sum, toMoneyString, weekday } from '../src';

describe('money', () => {
  it('não sofre erro de ponto flutuante', () => {
    expect(toMoneyString(sum(['0.1', '0.2']))).toBe('0.30');
    expect(sum(Array(10).fill('0.1')).toFixed(2)).toBe('1.00');
  });
  it('rejeita entradas inválidas', () => {
    expect(() => money('12,50')).toThrow();
    expect(() => money(Number.NaN)).toThrow();
  });
  it('divide valores sem perder centavos', () => {
    const parts = splitEvenly('100.00', 3).map((p) => p.toFixed(2));
    expect(parts).toEqual(['33.34', '33.33', '33.33']);
    expect(toMoneyString(sum(parts))).toBe('100.00');
  });
});

describe('datas', () => {
  it('soma meses respeitando fim de mês', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-11-15', 2)).toBe('2026-01-15');
  });
  it('valida datas inexistentes', () => {
    expect(() => assertISODate('2025-02-30')).toThrow();
  });
});

describe('recorrência', () => {
  it('semanal nas terças e quintas', () => {
    const d = expandRecurrence({ frequency: 'WEEKLY', startDate: '2025-10-01', until: '2025-10-15', weekdays: [2, 4] });
    expect(d).toEqual(['2025-10-02', '2025-10-07', '2025-10-09', '2025-10-14']);
    d.forEach((x) => expect([2, 4]).toContain(weekday(x)));
  });
  it('quinzenal alterna semanas', () => {
    const d = expandRecurrence({ frequency: 'BIWEEKLY', startDate: '2025-10-06', until: '2025-11-03', weekdays: [1] });
    expect(d).toEqual(['2025-10-06', '2025-10-20', '2025-11-03']);
  });
  it('12x36 / dia sim dia não, com exceções e sem duplicatas', () => {
    const d = expandRecurrence({ frequency: 'EVERY_N_DAYS', interval: 2, startDate: '2025-10-01', until: '2025-10-09', exceptions: ['2025-10-05'] });
    expect(d).toEqual(['2025-10-01', '2025-10-03', '2025-10-07', '2025-10-09']);
    expect(new Set(d).size).toBe(d.length);
  });
  it('mensal limita dia ao fim do mês', () => {
    const d = expandRecurrence({ frequency: 'MONTHLY', monthDays: [31], startDate: '2025-01-01', until: '2025-03-31' });
    expect(d).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });
  it('rejeita regras inválidas', () => {
    expect(() => expandRecurrence({ frequency: 'WEEKLY', startDate: '2025-01-01', until: '2025-02-01' })).toThrow();
    expect(() => expandRecurrence({ frequency: 'WEEKLY', weekdays: [1], startDate: '2025-02-01', until: '2025-01-01' })).toThrow();
  });
});
