import type {
  CardInvoicePayment, Contract, CreditCard, Expense, ExpenseCategory, Income, SalaryAdjustment, SalaryPayment,
  Shift, TaxProfile as DbTaxProfile, TaxProfileVersion,
} from '@prisma/client';
import type {
  CardRecord, ExpenseRecord, FixedContractInput, IncomeRecord, InvoicePaymentRecord, PaymentRule,
  SalaryPaymentRecord, ShiftRecord, TaxComponent, TaxProfile, TaxRuleVersion,
} from '@medfinance/core';
import { dec, fromDate } from '../lib/http';

/** Converte registros do Prisma nos tipos puros do @medfinance/core. */

export function toTaxProfile(p: DbTaxProfile & { versions: TaxProfileVersion[] }): TaxProfile {
  return {
    id: p.id,
    name: p.name,
    versions: p.versions.map((v): TaxRuleVersion => ({
      id: v.id,
      validFrom: fromDate(v.validFrom)!,
      validTo: fromDate(v.validTo),
      components: v.components as unknown as TaxComponent[],
      confidence: v.confidence,
      legalReference: v.legalReference,
      source: v.source,
      notes: v.notes,
    })),
  };
}

export function toContractInput(c: Contract & { adjustments: SalaryAdjustment[] }): FixedContractInput & { taxProfileId: string | null } {
  return {
    id: c.id,
    title: c.title,
    institutionId: c.institutionId,
    type: c.type,
    grossSalary: dec(c.grossSalary),
    additions: (c.additions as { label: string; amount: string }[]) ?? [],
    deductions: (c.deductions as { label: string; amount: string }[]) ?? [],
    payDays: c.payDays,
    payMonthOffset: c.payMonthOffset,
    startDate: fromDate(c.startDate)!,
    endDate: fromDate(c.endDate),
    trackFrom: fromDate(c.trackFrom),
    adjustments: c.adjustments.map((a) => ({ effectiveDate: fromDate(a.effectiveDate)!, grossSalary: dec(a.grossSalary)! })),
    taxProfileId: c.taxProfileId,
  };
}

export function toShiftRecord(s: Shift, contract?: Pick<Contract, 'type' | 'taxProfileId'> | null): ShiftRecord {
  return {
    id: s.id,
    institutionId: s.institutionId,
    contractId: s.contractId,
    modality: contract?.type ?? null,
    unit: s.unit,
    label: s.label,
    date: fromDate(s.date)!,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
    status: s.status,
    pricingMode: s.pricingMode,
    amount: dec(s.amount)!,
    additionalPercent: s.additionalPercent?.toString() ?? null,
    bonuses: dec(s.bonuses),
    deductions: dec(s.deductions),
    // Imposto do plantão: específico do lançamento ou herdado do vínculo
    taxProfileId: s.taxProfileId ?? contract?.taxProfileId ?? null,
    taxOverride: (s.taxOverride as TaxComponent[] | null) ?? null,
    confirmedTax: dec(s.confirmedTax),
    expectedPaymentDate: fromDate(s.expectedPaymentDate)!,
    receivedDate: fromDate(s.receivedDate),
    receivedAmount: dec(s.receivedAmount),
  };
}

export function toIncomeRecord(r: Income, contract?: Pick<Contract, 'type' | 'taxProfileId'> | null): IncomeRecord {
  return {
    id: r.id,
    description: r.description,
    category: r.category,
    institutionId: r.institutionId,
    contractId: r.contractId,
    modality: contract?.type ?? null,
    competenceDate: fromDate(r.competenceDate)!,
    expectedPaymentDate: fromDate(r.expectedPaymentDate)!,
    grossAmount: dec(r.grossAmount)!,
    deductions: dec(r.deductions),
    taxProfileId: r.taxProfileId ?? contract?.taxProfileId ?? null,
    taxOverride: (r.taxOverride as TaxComponent[] | null) ?? null,
    confirmedTax: dec(r.confirmedTax),
    status: r.status,
    receivedDate: fromDate(r.receivedDate),
    receivedAmount: dec(r.receivedAmount),
    hours: r.hours?.toString() ?? null,
  };
}

export function toSalaryPaymentRecord(p: SalaryPayment): SalaryPaymentRecord {
  return {
    contractId: p.contractId,
    competence: p.competence,
    index: p.index,
    status: p.status,
    receivedDate: fromDate(p.receivedDate),
    receivedAmount: dec(p.receivedAmount),
    confirmedTax: dec(p.confirmedTax),
  };
}

export function toExpenseRecord(e: Expense & { category?: ExpenseCategory | null }): ExpenseRecord {
  return {
    id: e.id,
    description: e.description,
    amount: dec(e.amount)!,
    categoryId: e.categoryId,
    scope: e.scope,
    isTax: e.category?.isTax ?? false,
    competenceDate: fromDate(e.competenceDate)!,
    dueDate: fromDate(e.dueDate)!,
    paidDate: fromDate(e.paidDate),
    status: e.status,
    paymentMethod: e.paymentMethod,
    creditCardId: e.creditCardId,
    installmentNumber: e.installmentNumber,
    installmentCount: e.installmentCount,
  };
}

export const toCardRecord = (c: CreditCard): CardRecord => ({ id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay });

export const toInvoicePaymentRecord = (p: CardInvoicePayment): InvoicePaymentRecord => ({
  cardId: p.cardId, reference: p.reference, paidDate: fromDate(p.paidDate)!, amount: dec(p.amount)!,
});

export const asPaymentRule = (v: unknown): PaymentRule | null => (v && typeof v === 'object' && 'mode' in v ? (v as PaymentRule) : null);
