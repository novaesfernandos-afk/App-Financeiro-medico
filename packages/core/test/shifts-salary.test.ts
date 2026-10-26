import { describe, expect, it } from 'vitest';
import {
  buildInstallments, cardInvoiceFor, computeShiftValues, effectiveShiftStatus, expectedPaymentDate,
  projectSalaryOccurrences, resolveShiftRate, shiftDurationMinutes, type FixedContractInput, type ShiftRate,
} from '../src';

describe('shift-calculator', () => {
  it('calcula duração atravessando a meia-noite', () => {
    expect(shiftDurationMinutes('07:00', '19:00')).toBe(720);
    expect(shiftDurationMinutes('19:00', '07:00')).toBe(720);
    expect(shiftDurationMinutes('07:00', '07:00')).toBe(1440);
    expect(() => shiftDurationMinutes('25:00', '07:00')).toThrow();
  });
  it('valor por hora com adicional noturno, bônus, imposto e descontos', () => {
    const v = computeShiftValues({
      date: '2025-10-10', durationMinutes: 720, pricingMode: 'PER_HOUR', amount: '125',
      additionalPercent: '20', bonuses: '100', deductions: '50',
      taxOverride: [{ code: 'ISS', kind: 'PERCENT', rate: '5' }],
    });
    // base 1500 + 300 adicional + 100 bônus = 1900; ISS 95; líquido 1900-95-50 = 1755
    expect(v.gross).toBe('1900.00');
    expect(v.tax.total).toBe('95.00');
    expect(v.net).toBe('1755.00');
    expect(v.netPerHour).toBe('146.25');
  });
  it('tabela de valores: dia da semana tem prioridade', () => {
    const rates: ShiftRate[] = [
      { shiftType: 'DIURNO', weekday: null, pricingMode: 'PER_SHIFT', amount: '1200' },
      { shiftType: 'DIURNO', weekday: 6, pricingMode: 'PER_SHIFT', amount: '1500' },
    ];
    expect(resolveShiftRate(rates, 'DIURNO', '2025-10-11')?.amount).toBe('1500'); // sábado
    expect(resolveShiftRate(rates, 'DIURNO', '2025-10-13')?.amount).toBe('1200');
    expect(resolveShiftRate(rates, 'NOTURNO', '2025-10-13')).toBeNull();
  });
  it('data prevista de pagamento', () => {
    expect(expectedPaymentDate('2025-10-20', { mode: 'DAYS_AFTER', days: 30 })).toBe('2025-11-19');
    expect(expectedPaymentDate('2025-10-20', { mode: 'MONTH_DAY', day: 10, monthsAfter: 1 })).toBe('2025-11-10');
    expect(expectedPaymentDate('2025-01-31', { mode: 'MONTH_DAY', day: 31, monthsAfter: 1 })).toBe('2025-02-28');
  });
  it('status efetivo marca atrasos', () => {
    expect(effectiveShiftStatus('A_RECEBER', '2025-10-01', '2025-10-10')).toBe('ATRASADO');
    expect(effectiveShiftStatus('AGENDADO', '2025-10-01', '2025-10-10')).toBe('AGENDADO');
    expect(effectiveShiftStatus('RECEBIDO', '2025-10-01', '2025-10-10')).toBe('RECEBIDO');
  });
});

describe('vínculos fixos', () => {
  const contract: FixedContractInput = {
    id: 'c1', title: 'Hospital X - CLT', institutionId: 'i1', type: 'CLT', grossSalary: '10000',
    additions: [{ label: 'Insalubridade', amount: '500' }], deductions: [{ label: 'Plano de saúde', amount: '300' }],
    payDays: [5], payMonthOffset: 1, startDate: '2025-03-10', endDate: '2025-06-30',
    adjustments: [{ effectiveDate: '2025-05-01', grossSalary: '11000' }],
    taxProfile: { id: 'clt', name: 'CLT', versions: [{ validFrom: '2025-01-01', confidence: 'ESTIMATED', components: [{ code: 'INSS', kind: 'PERCENT', rate: '10', withheldAtSource: true }] }] },
  };
  it('projeta somente na vigência, com reajuste e pagamento no mês seguinte', () => {
    const occ = projectSalaryOccurrences(contract, '2025-01', '2025-12');
    expect(occ.map((o) => o.competence)).toEqual(['2025-03', '2025-04', '2025-05', '2025-06']);
    expect(occ[0]!.expectedDate).toBe('2025-04-05');
    expect(occ[0]!.gross).toBe('10500.00');
    expect(occ[0]!.net).toBe('9150.00'); // 10500 - 1050 - 300
    expect(occ[2]!.gross).toBe('11500.00');
  });
  it('não gera competências anteriores ao início do acompanhamento', () => {
    const occ = projectSalaryOccurrences({ ...contract, trackFrom: '2025-05-02' }, '2025-01', '2025-12');
    expect(occ.map((o) => o.competence)).toEqual(['2025-05', '2025-06']);
  });
  it('quinzenal divide sem perder centavos', () => {
    const occ = projectSalaryOccurrences({ ...contract, payDays: [20, 5], grossSalary: '10000.01', additions: [], adjustments: [] }, '2025-04', '2025-04');
    expect(occ.map((o) => o.expectedDate)).toEqual(['2025-05-05', '2025-05-20']);
    expect(occ.map((o) => o.gross)).toEqual(['5000.01', '5000.00']);
  });
});

describe('despesas', () => {
  it('parcelamento soma exatamente o total', () => {
    const p = buildInstallments('1000', 3, '2025-01-31');
    expect(p.map((x) => x.amount)).toEqual(['333.34', '333.33', '333.33']);
    expect(p.map((x) => x.date)).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });
  it('fatura do cartão respeita fechamento e vencimento', () => {
    const card = { closingDay: 25, dueDay: 5 };
    expect(cardInvoiceFor('2025-10-10', card)).toEqual({ reference: '2025-11', closingDate: '2025-10-25', dueDate: '2025-11-05' });
    expect(cardInvoiceFor('2025-10-25', card).dueDate).toBe('2025-12-05');
    expect(cardInvoiceFor('2025-10-01', { closingDay: 3, dueDay: 10 }).dueDate).toBe('2025-10-10');
  });
});
