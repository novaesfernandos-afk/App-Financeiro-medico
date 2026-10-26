import {
  addMonthsYM, applyFilters, buildCalendarEvents, CONTRACT_TYPES, computeDashboard, daySummary, money, monthRange,
  sum, toMoneyString, yearMonthOf, type LedgerItem, type Modality,
} from '@medfinance/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, zDate, zYearMonth } from '../lib/http';
import { loadLedger } from '../services/ledger-loader';

const csv = (v: unknown) => (typeof v === 'string' && v.length ? v.split(',') : undefined);
const modalities = [...CONTRACT_TYPES, 'AVULSO'] as const;

const filtersSchema = z.object({
  institutionIds: z.preprocess(csv, z.array(z.string()).optional()),
  modalities: z.preprocess(csv, z.array(z.enum(modalities)).optional()),
});

/** Endpoints analíticos — todos derivados do mesmo ledger (camada central de regras). */
export async function financeRoutes(app: FastifyInstance) {
  app.get('/dashboard', async (req) => {
    const q = parse(filtersSchema.extend({ month: zYearMonth }), req.query);
    const from = monthRange(addMonthsYM(q.month, -12)).start;
    const to = monthRange(addMonthsYM(q.month, 4)).end;
    const { ledger, openings, today, names } = await loadLedger(app.prisma, req.userId, { from, to });
    const profile = await app.prisma.profile.findUnique({ where: { userId: req.userId } });
    const dashboard = computeDashboard({ ledger, month: q.month, today, openings, filters: { institutionIds: q.institutionIds, modalities: q.modalities as Modality[] } });
    return {
      ...dashboard,
      declared: {
        netWorth: profile?.declaredNetWorth?.toFixed(2) ?? null,
        investments: profile?.declaredInvestments?.toFixed(2) ?? null,
        emergencyReserveTarget: profile?.emergencyReserveTarget?.toFixed(2) ?? null,
      },
      hasAccounts: openings.length > 0,
      names,
    };
  });

  app.get('/calendar', async (req) => {
    const q = parse(z.object({ from: zDate, to: zDate }), req.query);
    const { ledger, names } = await loadLedger(app.prisma, req.userId, q);
    return { events: buildCalendarEvents(ledger, q.from, q.to), names };
  });

  app.get('/calendar/day', async (req) => {
    const { date } = parse(z.object({ date: zDate }), req.query);
    const { ledger, openings, names } = await loadLedger(app.prisma, req.userId, { from: date, to: date });
    return { ...daySummary(ledger, date, openings), names };
  });

  /** Lançamentos normalizados (receitas, salários projetados, despesas, faturas) com rastreabilidade. */
  app.get('/ledger', async (req) => {
    const q = parse(filtersSchema.extend({
      from: zDate, to: zDate,
      basis: z.enum(['competence', 'cash']).default('competence'),
      direction: z.enum(['IN', 'OUT']).optional(),
      source: z.enum(['SHIFT', 'SALARY', 'INCOME', 'EXPENSE', 'CARD_INVOICE']).optional(),
    }), req.query);
    const { ledger, names } = await loadLedger(app.prisma, req.userId, q);
    const items = applyFilters(ledger, { institutionIds: q.institutionIds, modalities: q.modalities as Modality[] }).filter((i) => {
      const d = q.basis === 'cash' ? i.cashDate : i.competenceDate;
      return d >= q.from && d <= q.to && (!q.direction || i.direction === q.direction) && (!q.source || i.source === q.source);
    });
    return { items: items.sort((a, b) => b.competenceDate.localeCompare(a.competenceDate)), names };
  });

  /** Recebíveis: tudo que foi trabalhado/devido e ainda não entrou. */
  app.get('/receivables', async (req) => {
    const { ledger, today, names } = await loadLedger(app.prisma, req.userId, { from: `${yearMonthOf(new Date().toISOString().slice(0, 10))}-01`, to: monthRange(addMonthsYM(yearMonthOf(new Date().toISOString().slice(0, 10)), 3)).end });
    const items = ledger
      .filter((i) => i.direction === 'IN' && (i.cashStatus === 'PENDING' || i.cashStatus === 'OVERDUE') && i.certainty !== 'PROJECTED')
      .sort((a, b) => a.cashDate.localeCompare(b.cashDate));
    return {
      today,
      total: toMoneyString(sum(items.map((i) => i.net))),
      overdue: toMoneyString(sum(items.filter((i) => i.cashStatus === 'OVERDUE').map((i) => i.net))),
      items,
      names,
    };
  });

  /** Carga tributária por fonte de renda no ano (comparativo). */
  app.get('/tax/summary', async (req) => {
    const { year } = parse(z.object({ year: z.coerce.number().int().min(2000).max(2100) }), req.query);
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const { ledger, names } = await loadLedger(app.prisma, req.userId, { from, to });
    const income = ledger.filter((i) => i.direction === 'IN' && i.cashStatus !== 'CANCELLED' && i.competenceDate >= from && i.competenceDate <= to);
    const groups = new Map<string, LedgerItem[]>();
    for (const i of income) {
      const k = `${i.institutionId ?? 'avulso'}|${i.modality ?? 'AVULSO'}`;
      groups.set(k, [...(groups.get(k) ?? []), i]);
    }
    const bySource = [...groups.entries()].map(([k, items]) => {
      const [institutionId, modality] = k.split('|');
      const gross = sum(items.map((i) => i.gross));
      const tax = sum(items.map((i) => i.tax));
      return {
        institutionId, modality,
        gross: toMoneyString(gross), tax: toMoneyString(tax),
        withheld: toMoneyString(sum(items.map((i) => i.taxWithheld))),
        effectiveRate: gross.isZero() ? '0.00' : tax.dividedBy(gross).times(100).toFixed(2),
        confirmed: items.filter((i) => i.taxStatus === 'CONFIRMED').length,
        estimated: items.filter((i) => i.taxStatus === 'ESTIMATED').length,
        notConfigured: items.filter((i) => i.taxStatus === 'NOT_CONFIGURED').length,
      };
    }).sort((a, b) => money(b.gross).comparedTo(money(a.gross)));
    const taxExpenses = ledger.filter((i) => i.isTax && i.cashStatus !== 'CANCELLED' && i.cashDate >= from && i.cashDate <= to);
    return {
      year,
      totals: {
        gross: toMoneyString(sum(income.map((i) => i.gross))),
        taxProvisioned: toMoneyString(sum(income.map((i) => i.tax))),
        taxWithheld: toMoneyString(sum(income.map((i) => i.taxWithheld))),
        taxConfirmed: toMoneyString(sum(income.filter((i) => i.taxStatus === 'CONFIRMED').map((i) => i.tax))),
        taxPaidAsExpense: toMoneyString(sum(taxExpenses.filter((i) => i.cashStatus === 'DONE').map((i) => i.net))),
        taxPendingAsExpense: toMoneyString(sum(taxExpenses.filter((i) => i.cashStatus !== 'DONE').map((i) => i.net))),
      },
      bySource,
      upcomingObligations: taxExpenses.filter((i) => i.cashStatus !== 'DONE').sort((a, b) => a.cashDate.localeCompare(b.cashDate)),
      names,
    };
  });
}
