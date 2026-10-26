import { describe, expect, it } from 'vitest';
import {
  buildCalendarEvents, buildLedger, computeDashboard, daySummary,
  type ExpenseRecord, type LedgerInput, type ShiftRecord,
} from '../src';

const baseShift: ShiftRecord = {
  id: 's1', institutionId: 'hospA', contractId: 'cA', modality: 'PJ', date: '2025-10-28',
  startTime: '19:00', endTime: '07:00', type: 'NOTURNO', status: 'REALIZADO',
  pricingMode: 'PER_SHIFT', amount: '1800', additionalPercent: null, bonuses: null, deductions: null,
  taxProfileId: 'pjA', taxOverride: null, confirmedTax: null,
  expectedPaymentDate: '2025-11-20', receivedDate: null, receivedAmount: null,
};

const exp = (over: Partial<ExpenseRecord>): ExpenseRecord => ({
  id: 'e', description: 'Despesa', amount: '100', categoryId: 'cat', scope: 'PESSOAL', isTax: false,
  competenceDate: '2025-10-05', dueDate: '2025-10-05', paidDate: null, status: 'PENDENTE',
  paymentMethod: 'PIX', creditCardId: null, installmentNumber: null, installmentCount: null, ...over,
});

function input(over: Partial<LedgerInput> = {}): LedgerInput {
  return {
    from: '2025-01-01', to: '2025-12-31', today: '2025-10-30',
    shifts: [
      baseShift,
      { ...baseShift, id: 's2', institutionId: 'hospB', contractId: null, modality: null, date: '2025-10-10', startTime: '07:00', endTime: '19:00', type: 'DIURNO',
        status: 'RECEBIDO', pricingMode: 'PER_HOUR', amount: '100', taxProfileId: null, expectedPaymentDate: '2025-10-25', receivedDate: '2025-10-24', receivedAmount: '1150' },
      { ...baseShift, id: 's3', date: '2025-11-05', status: 'AGENDADO', expectedPaymentDate: '2025-12-20' },
      { ...baseShift, id: 's4', date: '2025-10-15', status: 'CANCELADO' },
    ],
    contracts: [{
      id: 'cClt', title: 'Hospital C CLT', institutionId: 'hospC', type: 'CLT', grossSalary: '8000', additions: [], deductions: [],
      payDays: [5], payMonthOffset: 1, startDate: '2025-01-01', trackFrom: '2025-09-15', endDate: null, adjustments: [], taxProfileId: null,
    }],
    salaryPayments: [{ contractId: 'cClt', competence: '2025-09', index: 0, status: 'RECEBIDO', receivedDate: '2025-10-05', receivedAmount: '6900.00', confirmedTax: '1100.00' }],
    incomes: [],
    expenses: [
      exp({ id: 'e1', amount: '2500', dueDate: '2025-10-10', status: 'PAGO', paidDate: '2025-10-10' }),
      exp({ id: 'e2', amount: '300', competenceDate: '2025-10-12', paymentMethod: 'CARTAO_CREDITO', creditCardId: 'card' }),
      exp({ id: 'e3', amount: '200', competenceDate: '2025-10-20', paymentMethod: 'CARTAO_CREDITO', creditCardId: 'card' }),
      exp({ id: 'e4', amount: '900', isTax: true, scope: 'PROFISSIONAL', competenceDate: '2025-10-20', dueDate: '2025-10-20', status: 'PAGO', paidDate: '2025-10-20' }),
    ],
    cards: [{ id: 'card', name: 'Visa', closingDay: 25, dueDay: 5 }],
    invoicePayments: [],
    taxProfiles: { pjA: { id: 'pjA', name: 'PJ A', versions: [{ validFrom: '2025-01-01', confidence: 'ESTIMATED', components: [{ code: 'DAS', kind: 'PERCENT', rate: '10' }] }] } },
    ...over,
  };
}

describe('ledger', () => {
  const ledger = buildLedger(input());
  const byKey = (k: string) => ledger.find((i) => i.key === k)!;

  it('separa data de trabalho e data de pagamento do plantão', () => {
    const s1 = byKey('shift:s1');
    expect(s1.competenceDate).toBe('2025-10-28');
    expect(s1.cashDate).toBe('2025-11-20');
    expect(s1.gross).toBe('1800.00');
    expect(s1.tax).toBe('180.00');
    expect(s1.net).toBe('1620.00');
    expect(s1.certainty).toBe('ESTIMATED');
  });
  it('plantão recebido usa valor efetivo e data real', () => {
    const s2 = byKey('shift:s2');
    expect(s2.gross).toBe('1200.00');
    expect(s2.taxStatus).toBe('NOT_CONFIGURED');
    expect(s2.net).toBe('1150.00');
    expect(s2.cashDate).toBe('2025-10-24');
    expect(s2.certainty).toBe('REAL');
  });
  it('salário projetado sem duplicar competência já recebida', () => {
    const sep = ledger.filter((i) => i.key === 'salary:cClt:2025-09:0');
    expect(sep).toHaveLength(1);
    expect(sep[0]!.net).toBe('6900.00');
    expect(sep[0]!.tax).toBe('1100.00');
    expect(sep[0]!.taxStatus).toBe('CONFIRMED');
    expect(byKey('salary:cClt:2025-10:0').cashStatus).toBe('PENDING');
    expect(byKey('salary:cClt:2025-12:0').certainty).toBe('PROJECTED');
  });
  it('compras no cartão viram consumo e a fatura vira saída de caixa (sem dupla contagem)', () => {
    const inv = byKey('invoice:card:2025-11');
    expect(inv.net).toBe('500.00');
    expect(inv.isConsumption).toBe(false);
    expect(byKey('expense:e2').affectsCash).toBe(false);
    expect(byKey('expense:e2').cashDate).toBe('2025-11-05');
  });
  it('chaves são únicas', () => {
    expect(new Set(ledger.map((i) => i.key)).size).toBe(ledger.length);
  });
  it('todo item tem rastreabilidade', () => {
    ledger.forEach((i) => expect(i.trace.length).toBeGreaterThan(10));
  });
});

describe('dashboard', () => {
  const ledger = buildLedger(input());
  const d = computeDashboard({ ledger, month: '2025-10', today: '2025-10-30', openings: [{ amount: '10000', date: '2025-09-30' }] });

  it('receita por competência separa real/estimado/projetado', () => {
    // Outubro: s1 (1800), s2 (1200), salário CLT competência out (8000); s4 cancelado ignorado
    expect(d.kpis.grossRevenue).toBe('11000.00');
    expect(d.kpis.netRevenueByCertainty.REAL).toBe('1150.00');
    expect(d.kpis.netRevenueByCertainty.ESTIMATED).toBe('9620.00');
    expect(d.kpis.netRevenue).toBe('10770.00');
    expect(d.kpis.entriesWithoutTax).toBe(2); // s2 e salário sem perfil
  });
  it('recebido é regime de caixa', () => {
    // s2 em 24/10 + salário de setembro em 05/10
    expect(d.kpis.receivedRevenue).toBe('8050.00');
  });
  it('despesas por competência incluem cartão uma única vez', () => {
    expect(d.kpis.expenses).toBe('3900.00');
    expect(d.kpis.expensesPaid).toBe('3400.00');
    expect(d.kpis.taxesPaid).toBe('900.00');
  });
  it('saldo disponível = inicial + recebidos − pagos', () => {
    // 10000 + 6900 + 1150 - 2500 - 900
    expect(d.kpis.availableBalance).toBe('14650.00');
  });
  it('contas a receber/pagar', () => {
    // s1 1620 (estimado, não vencido) + salário out 8000 (vence 05/11)
    expect(d.kpis.receivables).toBe('9620.00');
    expect(d.kpis.payables).toBe('500.00');
  });
  it('produtividade por hora', () => {
    expect(d.kpis.hoursWorked).toBe('24.00');
    expect(d.kpis.shiftsDone).toBe(2);
    const a = d.byInstitution.find((b) => b.id === 'hospA')!;
    expect(a.netPerHour).toBe('135.00');
  });
  it('filtros por instituição e modalidade', () => {
    const f = computeDashboard({ ledger, month: '2025-10', today: '2025-10-30', openings: [], filters: { modalities: ['CLT'] } });
    expect(f.kpis.grossRevenue).toBe('8000.00');
    expect(f.kpis.availableBalance).toBeNull();
  });
  it('sem dados não inventa números', () => {
    const empty = computeDashboard({ ledger: [], month: '2025-10', today: '2025-10-30', openings: [] });
    expect(empty.kpis.grossRevenue).toBe('0.00');
    expect(empty.kpis.availableBalance).toBeNull();
    expect(empty.kpis.netWorth).toBeNull();
  });
});

describe('calendário', () => {
  const ledger = buildLedger(input());
  it('plantão de outubro pago em novembro aparece em ambos os meses com papéis distintos', () => {
    const oct = buildCalendarEvents(ledger, '2025-10-01', '2025-10-31').filter((e) => e.ledgerKey === 'shift:s1');
    const nov = buildCalendarEvents(ledger, '2025-11-01', '2025-11-30').filter((e) => e.ledgerKey === 'shift:s1');
    expect(oct.map((e) => e.category)).toEqual(['PLANTAO_REALIZADO']);
    expect(nov.map((e) => e.category)).toEqual(['RECEBIMENTO_PREVISTO']);
    expect(nov[0]!.date).toBe('2025-11-20');
  });
  it('cancelados não aparecem; agendados aparecem como agendados', () => {
    const ev = buildCalendarEvents(ledger, '2025-10-01', '2025-11-30');
    expect(ev.some((e) => e.ledgerKey === 'shift:s4')).toBe(false);
    expect(ev.find((e) => e.ledgerKey === 'shift:s3')?.category).toBe('PLANTAO_AGENDADO');
    expect(ev.find((e) => e.ledgerKey === 'invoice:card:2025-11')?.category).toBe('FATURA');
    expect(ev.find((e) => e.ledgerKey === 'expense:e4')?.category).toBe('IMPOSTO');
  });
  it('resumo do dia', () => {
    const s = daySummary(ledger, '2025-11-05', [{ amount: '10000', date: '2025-09-30' }]);
    expect(s.netIn).toBe('8000.00'); // salário de outubro
    expect(s.expenses).toBe('500.00'); // fatura
    expect(s.shiftsScheduled).toBe(1);
    // 14650 + 8000 - 500
    expect(s.projectedBalance).toBe('22150.00');
  });
});
