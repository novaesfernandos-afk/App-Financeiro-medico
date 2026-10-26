import { addMonthsYM, dateFromParts, monthsBetween, type ISODate, type YearMonth, yearMonthOf } from './dates';
import { money, splitEvenly, sum, toMoneyString, type MoneyInput } from './money';
import { resolveTax, type TaxProfile, type TaxResult } from './tax';

/** Skill `medical-income-tracker` — vínculos fixos (salário/pró-labore/contrato mensal). */

export const CONTRACT_TYPES = ['CLT', 'PJ', 'PF', 'COOPERATIVA', 'OUTRO'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export interface NamedAmount {
  label: string;
  amount: string;
}

export interface SalaryAdjustment {
  effectiveDate: ISODate;
  grossSalary: string;
}

export interface FixedContractInput {
  id: string;
  title: string;
  institutionId: string;
  type: ContractType;
  grossSalary: string | null;
  /** Adicionais/benefícios recorrentes somados ao bruto. */
  additions: NamedAmount[];
  /** Descontos recorrentes (plano de saúde, cooperativa...) após impostos. */
  deductions: NamedAmount[];
  /** Dias de pagamento no mês; o bruto é dividido igualmente entre eles. [5] mensal, [5,20] quinzenal. */
  payDays: number[];
  /** 0 = paga no próprio mês de competência; 1 = no mês seguinte. */
  payMonthOffset: number;
  startDate: ISODate;
  endDate: ISODate | null;
  /**
   * Início do acompanhamento no app. Competências anteriores não são geradas,
   * evitando que um vínculo antigo produza meses "a receber" que o usuário
   * nunca registrou.
   */
  trackFrom?: ISODate | null;
  adjustments: SalaryAdjustment[];
  taxProfile?: TaxProfile | null;
}

export interface SalaryOccurrence {
  key: string;
  contractId: string;
  competence: YearMonth;
  index: number;
  expectedDate: ISODate;
  gross: string;
  tax: TaxResult;
  deductions: string;
  net: string;
}

/** Salário bruto vigente na competência (considera reajustes). */
export function grossForCompetence(contract: FixedContractInput, competence: YearMonth): string {
  const applicable = contract.adjustments
    .filter((a) => yearMonthOf(a.effectiveDate) <= competence)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
    .at(-1);
  return applicable?.grossSalary ?? contract.grossSalary ?? '0';
}

export function salaryOccurrenceKey(contractId: string, competence: YearMonth, index: number): string {
  return `salary:${contractId}:${competence}:${index}`;
}

/**
 * Projeta os pagamentos do vínculo para as competências do intervalo.
 * Meses fora da vigência do contrato não geram ocorrência.
 */
export function projectSalaryOccurrences(
  contract: FixedContractInput,
  fromYM: YearMonth,
  toYM: YearMonth,
): SalaryOccurrence[] {
  if (!contract.grossSalary || money(contract.grossSalary).isZero()) return [];
  const payDays = contract.payDays.length ? [...contract.payDays].sort((a, b) => a - b) : [5];
  const startYM = [contract.startDate, contract.trackFrom ?? contract.startDate].map(yearMonthOf).sort().at(-1)!;
  const endYM = contract.endDate ? yearMonthOf(contract.endDate) : null;
  const out: SalaryOccurrence[] = [];
  for (const competence of monthsBetween(fromYM, toYM)) {
    if (competence < startYM || (endYM && competence > endYM)) continue;
    const monthlyGross = money(grossForCompetence(contract, competence)).plus(sum(contract.additions.map((a) => a.amount)));
    const tax = resolveTax({ gross: monthlyGross, date: `${competence}-01`, profile: contract.taxProfile });
    const grossParts = splitEvenly(monthlyGross, payDays.length);
    const taxParts = splitEvenly(tax.total, payDays.length);
    const dedParts = splitEvenly(sum(contract.deductions.map((d) => d.amount)), payDays.length);
    const payYM = addMonthsYM(competence, contract.payMonthOffset);
    const [py, pm] = payYM.split('-').map(Number) as [number, number];
    payDays.forEach((day, index) => {
      const gross = grossParts[index]!;
      const taxTotal = taxParts[index]!;
      const ded = dedParts[index]!;
      const ratio = monthlyGross.isZero() ? money(0) : gross.dividedBy(monthlyGross);
      out.push({
        key: salaryOccurrenceKey(contract.id, competence, index),
        contractId: contract.id,
        competence,
        index,
        expectedDate: dateFromParts(py, pm, day),
        gross: toMoneyString(gross),
        tax: {
          ...tax,
          gross: toMoneyString(gross),
          total: toMoneyString(taxTotal),
          withheld: toMoneyString(money(tax.withheld).times(ratio)),
          payable: toMoneyString(taxTotal.minus(money(tax.withheld).times(ratio))),
          items: tax.items.map((it) => ({ ...it, amount: toMoneyString(money(it.amount).times(ratio)) })),
        },
        deductions: toMoneyString(ded),
        net: toMoneyString(gross.minus(taxTotal).minus(ded)),
      });
    });
  }
  return out;
}

export function netFromGross(gross: MoneyInput, tax: MoneyInput, deductions: MoneyInput): string {
  return toMoneyString(money(gross).minus(money(tax)).minus(money(deductions)));
}
