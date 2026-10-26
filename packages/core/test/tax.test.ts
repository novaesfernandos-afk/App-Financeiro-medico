import { describe, expect, it } from 'vitest';
import { computeTax, resolveTax, selectTaxVersion, type TaxProfile, validateComponents, validateVersions } from '../src';

const pj: TaxProfile = {
  id: 'pj',
  name: 'PJ Hospital A',
  versions: [
    { id: 'v1', validFrom: '2024-01-01', validTo: '2024-12-31', confidence: 'ESTIMATED', components: [{ code: 'DAS', kind: 'PERCENT', rate: '6' }], legalReference: 'LC 123/2006', source: 'contador' },
    { id: 'v2', validFrom: '2025-01-01', validTo: null, confidence: 'CONFIRMED', components: [{ code: 'DAS', kind: 'PERCENT', rate: '8.5' }] },
  ],
};

describe('tax-engine-br', () => {
  it('sem perfil configurado não aplica alíquota genérica', () => {
    const r = resolveTax({ gross: '1500', date: '2025-05-01' });
    expect(r.status).toBe('NOT_CONFIGURED');
    expect(r.total).toBe('0.00');
  });
  it('usa a versão vigente na data de competência', () => {
    expect(selectTaxVersion(pj, '2024-06-10')?.id).toBe('v1');
    expect(selectTaxVersion(pj, '2025-06-10')?.id).toBe('v2');
    expect(selectTaxVersion(pj, '2023-06-10')).toBeNull();
    expect(resolveTax({ gross: '1000', date: '2024-06-01', profile: pj }).total).toBe('60.00');
    const r = resolveTax({ gross: '1000', date: '2025-06-01', profile: pj });
    expect(r.total).toBe('85.00');
    expect(r.status).toBe('CONFIRMED');
  });
  it('combina percentuais, fixos e retenções na fonte', () => {
    const r = computeTax('2000', [
      { code: 'ISS', kind: 'PERCENT', rate: '5', withheldAtSource: true },
      { code: 'IRRF', kind: 'PERCENT', rate: '1.5', withheldAtSource: true },
      { code: 'OUTRO', kind: 'FIXED', amount: '12.30', label: 'Taxa cooperativa' },
    ]);
    expect(r.total).toBe('142.30');
    expect(r.withheld).toBe('130.00');
    expect(r.payable).toBe('12.30');
    expect(r.effectiveRate).toBe('7.12');
  });
  it('tabela progressiva com parcela a deduzir e base após tributos anteriores', () => {
    const r = computeTax('5000', [
      { code: 'INSS', kind: 'PERCENT', rate: '11' },
      { code: 'IRRF', kind: 'PROGRESSIVE', base: 'GROSS_MINUS_PREVIOUS', brackets: [
        { upTo: '2000', rate: '0' },
        { upTo: '4000', rate: '15', deduction: '300' },
        { upTo: null, rate: '27.5', deduction: '800' },
      ] },
    ]);
    // INSS 550; base IR 4450 => 4450*27.5% - 800 = 423.75
    expect(r.items.map((i) => i.amount)).toEqual(['550.00', '423.75']);
  });
  it('override por lançamento substitui o perfil', () => {
    const r = resolveTax({ gross: '1000', date: '2025-06-01', profile: pj, override: [{ code: 'ISS', kind: 'PERCENT', rate: '2' }] });
    expect(r.total).toBe('20.00');
    expect(r.status).toBe('ESTIMATED');
  });
  it('valor confirmado prevalece sobre estimativa', () => {
    const r = resolveTax({ gross: '1000', date: '2025-06-01', profile: pj, confirmedAmount: '77.10' });
    expect(r.status).toBe('CONFIRMED');
    expect(r.total).toBe('77.10');
  });
  it('valida componentes e vigências', () => {
    expect(() => validateComponents([{ code: 'ISS', kind: 'PERCENT', rate: '101' }])).toThrow();
    expect(() => validateComponents([{ code: 'ISS', kind: 'PERCENT', rate: '60' }, { code: 'INSS', kind: 'PERCENT', rate: '50' }])).toThrow();
    expect(() => validateVersions([
      { validFrom: '2025-01-01', validTo: null, confidence: 'ESTIMATED', components: [] },
      { validFrom: '2025-06-01', validTo: null, confidence: 'ESTIMATED', components: [] },
    ])).toThrow(/sobrepostas/);
    expect(() => validateVersions(pj.versions)).not.toThrow();
  });
});
