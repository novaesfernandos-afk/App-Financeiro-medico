import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/form';

export interface TaxComponentDraft {
  code: string;
  label?: string;
  kind: 'PERCENT' | 'FIXED';
  rate?: string;
  amount?: string;
  withheldAtSource?: boolean;
  base?: 'GROSS' | 'GROSS_MINUS_PREVIOUS';
}

const CODES = ['ISS', 'INSS', 'IRRF', 'IRPF', 'IRPJ', 'CSLL', 'PIS', 'COFINS', 'DAS', 'CPP', 'OUTRO'];

/** Editor de componentes tributários. Não há valores pré-preenchidos: o médico/contador informa a alíquota efetiva. */
export function TaxComponentsEditor({ value, onChange }: { value: TaxComponentDraft[]; onChange: (v: TaxComponentDraft[]) => void }) {
  const update = (i: number, patch: Partial<TaxComponentDraft>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">Nenhum tributo. Sem tributos, o sistema considera imposto zero e marca os lançamentos como "imposto não configurado".</p>}
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-xl border p-2">
          <Select aria-label="Tributo" className="col-span-4 sm:col-span-3" value={c.code} onChange={(e) => update(i, { code: e.target.value })}>
            {CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>
          <Select aria-label="Tipo" className="col-span-4 sm:col-span-3" value={c.kind} onChange={(e) => update(i, { kind: e.target.value as 'PERCENT' | 'FIXED' })}>
            <option value="PERCENT">% do bruto</option>
            <option value="FIXED">Valor fixo</option>
          </Select>
          <Input
            aria-label={c.kind === 'PERCENT' ? 'Alíquota (%)' : 'Valor (R$)'}
            className="col-span-4 sm:col-span-2 tabular"
            inputMode="decimal"
            placeholder={c.kind === 'PERCENT' ? '% ' : 'R$'}
            value={(c.kind === 'PERCENT' ? c.rate : c.amount) ?? ''}
            onChange={(e) => {
              const v = e.target.value.replace(',', '.');
              update(i, c.kind === 'PERCENT' ? { rate: v } : { amount: v });
            }}
          />
          <div className="col-span-10 sm:col-span-3"><Checkbox checked={Boolean(c.withheldAtSource)} onChange={(v) => update(i, { withheldAtSource: v })} label={<span className="text-xs">Retido na fonte</span>} /></div>
          <Button type="button" variant="ghost" size="icon" className="col-span-2 sm:col-span-1 justify-self-end" aria-label="Remover tributo" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { code: 'ISS', kind: 'PERCENT', rate: '' }])}>
        <Plus className="h-3.5 w-3.5" /> Adicionar tributo
      </Button>
    </div>
  );
}

export function cleanComponents(list: TaxComponentDraft[]) {
  return list
    .filter((c) => (c.kind === 'PERCENT' ? c.rate : c.amount))
    .map((c) => ({ code: c.code, kind: c.kind, rate: c.kind === 'PERCENT' ? c.rate : undefined, amount: c.kind === 'FIXED' ? c.amount : undefined, withheldAtSource: c.withheldAtSource, base: c.base }));
}
