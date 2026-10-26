import { buildLedger, type ISODate, type LedgerItem, type OpeningBalance, todayISO } from '@medfinance/core';
import type { PrismaClient } from '@prisma/client';
import { dec, fromDate } from '../lib/http';
import {
  toCardRecord, toContractInput, toExpenseRecord, toIncomeRecord, toInvoicePaymentRecord, toSalaryPaymentRecord,
  toShiftRecord, toTaxProfile,
} from './mappers';

export interface LoadedLedger {
  ledger: LedgerItem[];
  openings: OpeningBalance[];
  today: ISODate;
  names: {
    institutions: Record<string, { name: string; color: string }>;
    categories: Record<string, { name: string; color: string; scope: string; monthlyBudget: string | null }>;
  };
}

/**
 * Carrega TODOS os registros financeiros do usuário e monta o ledger.
 * (MVP: volume por usuário é pequeno; paginação/janela temporal é otimização futura.)
 * Este é o único ponto de entrada de dados para dashboard, calendário, relatórios e IA.
 */
export async function loadLedger(prisma: PrismaClient, userId: string, range: { from: ISODate; to: ISODate }, today = todayISO()): Promise<LoadedLedger> {
  const [taxProfiles, contracts, shifts, salaryPayments, incomes, expenses, cards, invoicePayments, accounts, institutions, categories] =
    await Promise.all([
      prisma.taxProfile.findMany({ where: { userId }, include: { versions: true } }),
      prisma.contract.findMany({ where: { userId }, include: { adjustments: true } }),
      prisma.shift.findMany({ where: { userId } }),
      prisma.salaryPayment.findMany({ where: { userId } }),
      prisma.income.findMany({ where: { userId } }),
      prisma.expense.findMany({ where: { userId }, include: { category: true } }),
      prisma.creditCard.findMany({ where: { userId } }),
      prisma.cardInvoicePayment.findMany({ where: { userId } }),
      prisma.bankAccount.findMany({ where: { userId, archived: false } }),
      prisma.institution.findMany({ where: { userId } }),
      prisma.expenseCategory.findMany({ where: { userId } }),
    ]);

  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const earliestTrack = contracts.map((c) => fromDate(c.trackFrom)!).sort()[0];
  const from = earliestTrack && earliestTrack < range.from ? earliestTrack : range.from;

  const ledger = buildLedger({
    from,
    to: range.to,
    today,
    taxProfiles: Object.fromEntries(taxProfiles.map((p) => [p.id, toTaxProfile(p)])),
    contracts: contracts.filter((c) => c.active || c.endDate).map(toContractInput),
    shifts: shifts.map((s) => toShiftRecord(s, s.contractId ? contractById.get(s.contractId) : null)),
    salaryPayments: salaryPayments.map(toSalaryPaymentRecord),
    incomes: incomes.map((i) => toIncomeRecord(i, i.contractId ? contractById.get(i.contractId) : null)),
    expenses: expenses.map(toExpenseRecord),
    cards: cards.map(toCardRecord),
    invoicePayments: invoicePayments.map(toInvoicePaymentRecord),
  });

  return {
    ledger,
    today,
    openings: accounts.map((a) => ({ amount: dec(a.initialBalance)!, date: fromDate(a.initialBalanceDate)! })),
    names: {
      institutions: Object.fromEntries(institutions.map((i) => [i.id, { name: i.name, color: i.color }])),
      categories: Object.fromEntries(categories.map((c) => [c.id, { name: c.name, color: c.color, scope: c.scope, monthlyBudget: dec(c.monthlyBudget) }])),
    },
  };
}
