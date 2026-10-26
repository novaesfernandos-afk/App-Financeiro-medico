import { todayISO } from '@medfinance/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client, makeApp } from './helpers';

let app: FastifyInstance;
let c: Client;
const ids: Record<string, string> = {};

beforeAll(async () => {
  app = await makeApp();
  c = await Client.registered(app, 'Dra. Fluxo');
});
afterAll(async () => { await app.close(); });

describe('fluxo financeiro completo', () => {
  it('cadastra instituições e perfis tributários distintos', async () => {
    ids.hospA = (await c.post('/institutions', { name: 'Hospital A', paymentRule: { mode: 'MONTH_DAY', day: 20, monthsAfter: 1 } })).data.id;
    ids.hospB = (await c.post('/institutions', { name: 'Hospital B' })).data.id;
    const pj = await c.post('/tax-profiles', {
      name: 'PJ Simples', scope: 'PJ',
      version: { validFrom: '2025-01-01', components: [{ code: 'DAS', kind: 'PERCENT', rate: '10' }], legalReference: 'LC 123/2006', source: 'Contador' },
    });
    expect(pj.statusCode).toBe(201);
    ids.pj = pj.data.id;
    ids.clt = (await c.post('/tax-profiles', {
      name: 'CLT Hospital B', scope: 'CLT',
      version: { validFrom: '2025-01-01', confidence: 'CONFIRMED', components: [{ code: 'INSS', kind: 'PERCENT', rate: '11', withheldAtSource: true }, { code: 'IRRF', kind: 'PERCENT', rate: '15', withheldAtSource: true, base: 'GROSS_MINUS_PREVIOUS' }] },
    })).data.id;
  });

  it('nova vigência encerra a anterior e rejeita sobreposição', async () => {
    const r = await c.post(`/tax-profiles/${ids.pj}/versions`, { validFrom: '2026-01-01', components: [{ code: 'DAS', kind: 'PERCENT', rate: '12' }] });
    expect(r.statusCode).toBe(201);
    const [v2026, v2025] = r.data.versions;
    expect(v2026.validFrom).toBe('2026-01-01');
    expect(v2025.validTo).toBe('2025-12-31');
    const overlap = await c.post(`/tax-profiles/${ids.pj}/versions`, { validFrom: '2025-06-01', validTo: '2025-07-01', components: [] });
    expect(overlap.statusCode).toBe(400);
  });

  it('simula impostos sem persistir', async () => {
    const sim = await c.post('/tax/simulate', { gross: '1000', date: '2025-03-01', taxProfileId: ids.pj });
    expect(sim.data.total).toBe('100.00');
    const sim2026 = await c.post('/tax/simulate', { gross: '1000', date: '2026-03-01', taxProfileId: ids.pj });
    expect(sim2026.data.total).toBe('120.00');
  });

  it('vínculos com regras tributárias diferentes', async () => {
    const pjContract = await c.post('/contracts', { institutionId: ids.hospA, title: 'Plantões PJ Hospital A', type: 'PJ', taxProfileId: ids.pj, startDate: '2025-01-01' });
    expect(pjContract.statusCode).toBe(201);
    ids.cA = pjContract.data.id;
    const clt = await c.post('/contracts', {
      institutionId: ids.hospB, title: 'CLT Hospital B', type: 'CLT', taxProfileId: ids.clt, grossSalary: '10000',
      deductions: [{ label: 'Plano de saúde', amount: '400' }], payDays: [5], payMonthOffset: 1, startDate: '2024-01-01', trackFrom: '2025-09-01',
    });
    expect(clt.statusCode).toBe(201);
    ids.cB = clt.data.id;
    const proj = await c.get(`/contracts/${ids.cB}/projection?from=2025-09&to=2025-10`);
    // 10000 - INSS 1100 - IRRF 15% de 8900 (1335) - 400
    expect(proj.data[0].net).toBe('7165.00');
    expect(proj.data[0].expectedDate).toBe('2025-10-05');
  });

  it('plantão usa tabela de valores da instituição e regra de pagamento', async () => {
    await c.post('/shift-rates', { institutionId: ids.hospA, shiftType: 'NOTURNO', pricingMode: 'PER_SHIFT', amount: '1800', defaultStart: '19:00', defaultEnd: '07:00' });
    await c.post('/shift-rates', { institutionId: ids.hospA, shiftType: 'NOTURNO', weekday: 6, pricingMode: 'PER_SHIFT', amount: '2200', defaultStart: '19:00', defaultEnd: '07:00' });
    const s = await c.post('/shifts', { institutionId: ids.hospA, contractId: ids.cA, date: '2025-10-28', type: 'NOTURNO', status: 'REALIZADO' });
    expect(s.statusCode).toBe(201);
    ids.s1 = s.data.id;
    expect(s.data.amount).toBe('1800');
    expect(s.data.expectedPaymentDate).toBe('2025-11-20');
    expect(s.data.computed.gross).toBe('1800.00');
    expect(s.data.computed.tax).toBe('180.00');
    expect(s.data.computed.net).toBe('1620.00');
    const sat = await c.post('/shifts', { institutionId: ids.hospA, contractId: ids.cA, date: '2025-10-25', type: 'NOTURNO', status: 'REALIZADO' });
    expect(sat.data.amount).toBe('2200');
  });

  it('impede plantão duplicado sem confirmação', async () => {
    const dup = await c.post('/shifts', { institutionId: ids.hospA, contractId: ids.cA, date: '2025-10-28', type: 'NOTURNO' });
    expect(dup.statusCode).toBe(409);
    const forced = await c.post('/shifts', { institutionId: ids.hospA, contractId: ids.cA, date: '2025-10-28', type: 'NOTURNO', allowDuplicate: true });
    expect(forced.statusCode).toBe(201);
    await c.del(`/shifts/${forced.data.id}`);
  });

  it('plantão avulso sem imposto configurado não recebe alíquota genérica', async () => {
    const s = await c.post('/shifts', { institutionId: ids.hospB, date: '2025-10-10', type: 'DIURNO', startTime: '07:00', endTime: '19:00', pricingMode: 'PER_HOUR', amount: '100', status: 'REALIZADO' });
    expect(s.data.computed.taxStatus).toBe('NOT_CONFIGURED');
    expect(s.data.computed.tax).toBe('0.00');
    ids.s2 = s.data.id;
    const rec = await c.patch(`/shifts/${ids.s2}`, { status: 'RECEBIDO', receivedDate: '2025-10-24', receivedAmount: '1150' });
    expect(rec.data.computed.net).toBe('1150.00');
    expect(rec.data.computed.certainty).toBe('REAL');
  });

  it('escala recorrente não duplica ao ser estendida', async () => {
    const body = {
      institutionId: ids.hospA, contractId: ids.cA,
      rule: { frequency: 'WEEKLY', startDate: '2025-11-01', until: '2025-11-30', weekdays: [1, 3] },
      template: { type: 'NOTURNO' },
    };
    const r = await c.post('/shifts/series', body);
    expect(r.statusCode).toBe(201);
    expect(r.data.created).toBe(8); // segundas e quartas de novembro/2025
    const ext = await c.post(`/shifts/series/${r.data.seriesId}/extend`, { until: '2025-12-15' });
    expect(ext.data.created).toBe(5); // apenas as novas datas: 1, 3, 8, 10 e 15/12
    const again = await c.post(`/shifts/series/${r.data.seriesId}/extend`, { until: '2025-12-15' });
    expect(again.data.created).toBe(0);
    const list = await c.get('/shifts?from=2025-11-01&to=2025-12-31');
    const dates = list.data.filter((s: any) => s.seriesId === r.data.seriesId).map((s: any) => s.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toHaveLength(13);
  });

  it('confirma salário recebido sem duplicar competência', async () => {
    const body = { contractId: ids.cB, competence: '2025-09', index: 0, receivedDate: '2025-10-06', receivedAmount: '7100.00', confirmedTax: '2400.00' };
    await c.put('/salary-payments', body);
    await c.put('/salary-payments', { ...body, receivedAmount: '7165.00' });
    expect(await app.prisma.salaryPayment.count({ where: { contractId: ids.cB } })).toBe(1);
  });

  it('despesas: parcelamento no cartão sem dupla contagem', async () => {
    const cats = (await c.get('/expense-categories')).data;
    const moradia = cats.find((x: any) => x.name === 'Moradia').id;
    const tributos = cats.find((x: any) => x.isTax).id;
    const card = (await c.post('/cards', { name: 'Visa Infinite', closingDay: 25, dueDay: 5 })).data;
    ids.card = card.id;
    const rent = await c.post('/expenses', { description: 'Aluguel', amount: '4500', categoryId: moradia, competenceDate: '2025-10-05', paymentMethod: 'BOLETO', status: 'PAGO', paidDate: '2025-10-05' });
    expect(rent.statusCode).toBe(201);
    const tv = await c.post('/expenses', { description: 'Notebook', amount: '3000', categoryId: cats[0].id, competenceDate: '2025-10-12', paymentMethod: 'CARTAO_CREDITO', creditCardId: card.id, installments: 3 });
    expect(tv.data).toHaveLength(3);
    expect(tv.data.map((e: any) => e.amount)).toEqual(['1000', '1000', '1000']);
    await c.post('/expenses', { description: 'DAS outubro', amount: '900', categoryId: tributos, competenceDate: '2025-10-20', status: 'PAGO', paidDate: '2025-10-20' });
    await c.post('/accounts', { name: 'Conta PJ', initialBalance: '20000', initialBalanceDate: '2025-09-30' });
  });

  it('dashboard reflete exatamente os dados cadastrados', async () => {
    const d = (await c.get('/dashboard?month=2025-10')).data;
    // Competência out/2025: plantões 1800 + 2200 + 1200 + salário CLT 10000
    expect(d.kpis.grossRevenue).toBe('15200.00');
    // Recebido em out: plantão 1150 + salário set 7165
    expect(d.kpis.receivedRevenue).toBe('8315.00');
    // Consumo out: aluguel 4500 + parcela 1/3 1000 + DAS 900
    expect(d.kpis.expenses).toBe('6400.00');
    expect(d.kpis.taxesPaid).toBe('900.00');
    // Saldo: 20000 + 1150 + 7165 - 4500 - 900
    expect(d.kpis.availableBalance).toBe('22915.00');
    expect(d.kpis.entriesWithoutTax).toBe(1);
    expect(d.byInstitution.map((b: any) => b.id).sort()).toEqual([ids.hospA, ids.hospB].sort());
    expect(d.netWorth).toBeUndefined();
    expect(d.kpis.netWorth).toBeNull();
  });

  it('filtros do dashboard por modalidade', async () => {
    const d = (await c.get('/dashboard?month=2025-10&modalities=PJ')).data;
    expect(d.kpis.grossRevenue).toBe('4000.00');
  });

  it('calendário separa trabalho (out) e pagamento (nov) do plantão', async () => {
    const oct = (await c.get('/calendar?from=2025-10-01&to=2025-10-31')).data.events.filter((e: any) => e.ledgerKey === `shift:${ids.s1}`);
    const nov = (await c.get('/calendar?from=2025-11-01&to=2025-11-30')).data.events.filter((e: any) => e.ledgerKey === `shift:${ids.s1}`);
    expect(oct.map((e: any) => [e.date, e.category])).toEqual([['2025-10-28', 'PLANTAO_REALIZADO']]);
    expect(nov.map((e: any) => e.date)).toEqual(['2025-11-20']);
    const day = (await c.get('/calendar/day?date=2025-11-05')).data;
    expect(day.events.some((e: any) => e.category === 'FATURA')).toBe(true);
    expect(day.events.some((e: any) => e.category === 'SALARIO' || e.category === 'RECEBIMENTO_ATRASADO' || e.category === 'RECEBIMENTO_PREVISTO')).toBe(true);
  });

  it('pagamento de fatura é transferência, não nova despesa', async () => {
    await c.put('/card-invoices', { cardId: ids.card, reference: '2025-11', paidDate: '2025-11-05', amount: '1000' });
    const nov = (await c.get('/dashboard?month=2025-11')).data;
    // Consumo de nov: só a parcela 2/3 (1000) — o pagamento da fatura não soma
    expect(nov.kpis.expenses).toBe('1000.00');
  });

  it('resumo tributário compara fontes e diferencia estimado/confirmado', async () => {
    const t = (await c.get('/tax/summary?year=2025')).data;
    const a = t.bySource.find((s: any) => s.institutionId === ids.hospA);
    expect(a.effectiveRate).toBe('10.00');
    expect(a.estimated).toBeGreaterThan(0);
    const b = t.bySource.find((s: any) => s.institutionId === ids.hospB && s.modality === 'CLT');
    expect(b.confirmed).toBeGreaterThan(0);
    expect(t.totals.taxPaidAsExpense).toBe('900.00');
  });

  it('ledger é rastreável', async () => {
    const l = (await c.get('/ledger?from=2025-10-01&to=2025-10-31')).data;
    expect(l.items.length).toBeGreaterThan(0);
    l.items.forEach((i: any) => expect(i.trace).toBeTruthy());
  });

  it('edição em lote exige confirmação', async () => {
    const no = await c.post('/shifts/bulk-status', { ids: [ids.s1], status: 'FATURADO' });
    expect(no.statusCode).toBe(400);
    const yes = await c.post('/shifts/bulk-status', { ids: [ids.s1], status: 'FATURADO', confirm: true });
    expect(yes.data.updated).toBe(1);
  });

  it('vínculo com lançamentos é desativado, não apagado', async () => {
    const r = await c.del(`/contracts/${ids.cA}`);
    expect(r.data.deactivated).toBe(true);
    expect(todayISO()).toMatch(/^\d{4}-/);
  });
});
