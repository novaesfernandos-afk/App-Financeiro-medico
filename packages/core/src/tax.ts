import { Decimal, money, percentOf, round2, sum, toMoneyString, type MoneyInput } from './money';
import type { ISODate } from './dates';

/**
 * Motor tributário (skill `tax-engine-br`).
 *
 * Princípios:
 *  - Não existe alíquota global: cada vínculo/lançamento aponta para um
 *    perfil tributário próprio (ou para nenhum).
 *  - Sem perfil configurado => imposto = 0 com status NOT_CONFIGURED.
 *    O sistema nunca "chuta" uma alíquota genérica.
 *  - Perfis são versionados por vigência (validFrom/validTo), com
 *    referência legal e fonte; o cálculo usa a versão vigente na data de
 *    competência do lançamento.
 *  - Estimativas (ESTIMATED) e valores confirmados (CONFIRMED) são distintos.
 */

export const TAX_CODES = [
  'ISS', 'INSS', 'IRRF', 'IRPF', 'IRPJ', 'CSLL', 'PIS', 'COFINS', 'DAS', 'CPP', 'OUTRO',
] as const;
export type TaxCode = (typeof TAX_CODES)[number];

export type TaxComponentKind = 'PERCENT' | 'FIXED' | 'PROGRESSIVE';
export type TaxBase = 'GROSS' | 'GROSS_MINUS_PREVIOUS';
export type TaxConfidence = 'ESTIMATED' | 'CONFIRMED';
export type TaxStatus = 'NOT_CONFIGURED' | TaxConfidence;

export interface TaxBracket {
  /** Limite superior da faixa (inclusivo); null = sem limite. */
  upTo: string | null;
  rate: string; // percentual
  /** Parcela a deduzir da faixa. */
  deduction?: string;
}

export interface TaxComponent {
  code: TaxCode;
  label?: string;
  kind: TaxComponentKind;
  /** PERCENT: alíquota em % (ex.: "5" = 5%). */
  rate?: string;
  /** FIXED: valor fixo por lançamento. */
  amount?: string;
  /** PROGRESSIVE: faixas. */
  brackets?: TaxBracket[];
  base?: TaxBase;
  /** Retido na fonte pela fonte pagadora (não precisa ser recolhido pelo médico). */
  withheldAtSource?: boolean;
}

export interface TaxRuleVersion {
  id?: string;
  validFrom: ISODate;
  validTo?: ISODate | null;
  components: TaxComponent[];
  confidence: TaxConfidence;
  legalReference?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface TaxProfile {
  id: string;
  name: string;
  versions: TaxRuleVersion[];
}

export interface TaxItem {
  code: TaxCode;
  label: string;
  amount: string;
  withheldAtSource: boolean;
}

export interface TaxResult {
  status: TaxStatus;
  gross: string;
  items: TaxItem[];
  total: string;
  withheld: string;
  /** Parcela que o médico/empresa ainda precisa recolher. */
  payable: string;
  /** Alíquota efetiva em % (total/gross). */
  effectiveRate: string;
  profileId?: string;
  versionId?: string;
  legalReference?: string | null;
  source?: string | null;
}

export class TaxValidationError extends Error {}

export function validateComponents(components: TaxComponent[]): void {
  let percentSum = new Decimal(0);
  for (const c of components) {
    if (!TAX_CODES.includes(c.code)) throw new TaxValidationError(`Código de tributo inválido: ${c.code}`);
    if (c.kind === 'PERCENT') {
      const r = money(c.rate);
      if (r.isNegative() || r.greaterThan(100)) throw new TaxValidationError(`Alíquota fora de 0–100%: ${c.rate}`);
      percentSum = percentSum.plus(r);
    } else if (c.kind === 'FIXED') {
      if (money(c.amount).isNegative()) throw new TaxValidationError('Valor fixo de tributo não pode ser negativo');
    } else if (c.kind === 'PROGRESSIVE') {
      if (!c.brackets?.length) throw new TaxValidationError('Tabela progressiva sem faixas');
      let last: Decimal | null = new Decimal(-1);
      for (const b of c.brackets) {
        const r = money(b.rate);
        if (r.isNegative() || r.greaterThan(100)) throw new TaxValidationError('Alíquota de faixa fora de 0–100%');
        if (last === null) throw new TaxValidationError('Faixa sem limite deve ser a última');
        if (b.upTo === null) last = null;
        else {
          const up = money(b.upTo);
          if (up.lessThanOrEqualTo(last)) throw new TaxValidationError('Faixas devem ser crescentes');
          last = up;
        }
      }
    } else {
      throw new TaxValidationError(`Tipo de componente inválido: ${(c as TaxComponent).kind}`);
    }
  }
  if (percentSum.greaterThan(100)) throw new TaxValidationError('Soma das alíquotas excede 100%');
}

export function validateVersions(versions: TaxRuleVersion[]): void {
  const sorted = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i]!;
    validateComponents(v.components);
    if (v.validTo && v.validTo < v.validFrom) throw new TaxValidationError('Vigência final anterior à inicial');
    const next = sorted[i + 1];
    if (next && (!v.validTo || v.validTo >= next.validFrom)) {
      throw new TaxValidationError(`Vigências sobrepostas a partir de ${next.validFrom}`);
    }
  }
}

/** Versão vigente na data (a de início mais recente que cubra a data). */
export function selectTaxVersion(profile: TaxProfile | null | undefined, date: ISODate): TaxRuleVersion | null {
  if (!profile) return null;
  const candidates = profile.versions
    .filter((v) => v.validFrom <= date && (!v.validTo || v.validTo >= date))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  return candidates[0] ?? null;
}

function progressive(base: Decimal, brackets: TaxBracket[]): Decimal {
  for (const b of brackets) {
    if (b.upTo === null || base.lessThanOrEqualTo(money(b.upTo))) {
      const t = percentOf(base, b.rate).minus(money(b.deduction));
      return Decimal.max(t, 0);
    }
  }
  return new Decimal(0);
}

export function computeTax(grossInput: MoneyInput, components: TaxComponent[]): Omit<TaxResult, 'status'> {
  const gross = money(grossInput);
  const items: TaxItem[] = [];
  let previous = new Decimal(0);
  for (const c of components) {
    const base = c.base === 'GROSS_MINUS_PREVIOUS' ? gross.minus(previous) : gross;
    let amount: Decimal;
    if (c.kind === 'PERCENT') amount = percentOf(base, c.rate);
    else if (c.kind === 'FIXED') amount = money(c.amount);
    else amount = progressive(base, c.brackets ?? []);
    amount = round2(Decimal.max(amount, 0));
    previous = previous.plus(amount);
    items.push({
      code: c.code,
      label: c.label ?? c.code,
      amount: toMoneyString(amount),
      withheldAtSource: Boolean(c.withheldAtSource),
    });
  }
  const total = sum(items.map((i) => i.amount));
  const withheld = sum(items.filter((i) => i.withheldAtSource).map((i) => i.amount));
  return {
    gross: toMoneyString(gross),
    items,
    total: toMoneyString(total),
    withheld: toMoneyString(withheld),
    payable: toMoneyString(total.minus(withheld)),
    effectiveRate: gross.isZero() ? '0.00' : total.dividedBy(gross).times(100).toFixed(2),
  };
}

export interface ResolveTaxInput {
  gross: MoneyInput;
  date: ISODate;
  profile?: TaxProfile | null;
  /** Componentes específicos do lançamento (substituem o perfil). */
  override?: TaxComponent[] | null;
  /** Imposto informado manualmente/confirmado (ex.: valor do informe). */
  confirmedAmount?: MoneyInput;
}

export function resolveTax(input: ResolveTaxInput): TaxResult {
  if (input.confirmedAmount !== undefined && input.confirmedAmount !== null && input.confirmedAmount !== '') {
    const gross = money(input.gross);
    const total = round2(input.confirmedAmount);
    return {
      status: 'CONFIRMED',
      gross: toMoneyString(gross),
      items: [{ code: 'OUTRO', label: 'Imposto confirmado', amount: toMoneyString(total), withheldAtSource: false }],
      total: toMoneyString(total),
      withheld: '0.00',
      payable: toMoneyString(total),
      effectiveRate: gross.isZero() ? '0.00' : total.dividedBy(gross).times(100).toFixed(2),
    };
  }
  if (input.override && input.override.length > 0) {
    return { status: 'ESTIMATED', ...computeTax(input.gross, input.override) };
  }
  const version = selectTaxVersion(input.profile, input.date);
  if (!version) {
    return {
      status: 'NOT_CONFIGURED',
      ...computeTax(input.gross, []),
      profileId: input.profile?.id,
    };
  }
  return {
    status: version.confidence,
    ...computeTax(input.gross, version.components),
    profileId: input.profile?.id,
    versionId: version.id,
    legalReference: version.legalReference ?? null,
    source: version.source ?? null,
  };
}
