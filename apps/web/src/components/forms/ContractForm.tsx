import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { CONTRACT_TYPE_LABEL } from '@/lib/labels';
import { useApiMutation, useCompanies, useInstitutions, useTaxProfiles } from '@/lib/queries';
import { InstitutionForm } from './InstitutionForm';
import { TaxProfileForm } from './TaxProfileForm';
import { nn, useFormState } from './useFormState';

type Named = { label: string; amount: string };

function NamedList({ label, value, onChange }: { label: string; value: Named[]; onChange: (v: Named[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      {value.map((d, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label="Descrição" placeholder="Descrição" value={d.label} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <div className="w-40 shrink-0"><MoneyInput aria-label="Valor" value={d.amount} onChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, amount: v } : x)))} /></div>
          <Button type="button" variant="ghost" size="icon" aria-label="Remover" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...value, { label: '', amount: '' }])}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
    </div>
  );
}

/** Vínculo: CLT, PJ, PF, cooperativa… com salário fixo e/ou plantões, cada um com sua regra tributária. */
export function ContractForm({ open, onOpenChange, contract, defaultInstitutionId }: { open: boolean; onOpenChange: (o: boolean) => void; contract?: any; defaultInstitutionId?: string }) {
  const toast = useToast();
  const institutions = useInstitutions();
  const taxProfiles = useTaxProfiles();
  const companies = useCompanies();
  const [instOpen, setInstOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const rule = contract?.shiftPaymentRule;
  const f = useFormState({
    institutionId: contract?.institutionId ?? defaultInstitutionId ?? '',
    title: contract?.title ?? '',
    type: contract?.type ?? 'PJ',
    companyId: contract?.companyId ?? '',
    taxProfileId: contract?.taxProfileId ?? '',
    hasSalary: contract ? Boolean(contract.grossSalary) : false,
    grossSalary: contract?.grossSalary ?? '',
    payDays: (contract?.payDays ?? [5]).join(', '),
    payMonthOffset: String(contract?.payMonthOffset ?? 1),
    startDate: contract?.startDate ?? todayISO(),
    endDate: contract?.endDate ?? '',
    trackFrom: contract?.trackFrom ?? '',
    ruleMode: rule?.mode ?? 'INHERIT',
    ruleDay: String(rule?.day ?? 10), ruleMonths: String(rule?.monthsAfter ?? 1), ruleDays: String(rule?.days ?? 30),
  });
  const [additions, setAdditions] = useState<Named[]>(contract?.additions ?? []);
  const [deductions, setDeductions] = useState<Named[]>(contract?.deductions ?? []);

  const save = useApiMutation(async () => {
    const v = f.values;
    const payDays = v.payDays.split(/[,;\s]+/).map(Number).filter((n: number) => n >= 1 && n <= 31);
    const body = {
      institutionId: v.institutionId, title: v.title, type: v.type,
      companyId: nn(v.companyId), taxProfileId: nn(v.taxProfileId),
      grossSalary: v.hasSalary ? v.grossSalary : null,
      additions: v.hasSalary ? additions.filter((a) => a.label && a.amount) : [],
      deductions: v.hasSalary ? deductions.filter((a) => a.label && a.amount) : [],
      payDays: payDays.length ? payDays : [5],
      payMonthOffset: Number(v.payMonthOffset),
      startDate: v.startDate, endDate: nn(v.endDate),
      trackFrom: v.trackFrom || undefined,
      shiftPaymentRule: v.ruleMode === 'INHERIT' ? null : v.ruleMode === 'DAYS_AFTER'
        ? { mode: 'DAYS_AFTER', days: Number(v.ruleDays) }
        : { mode: 'MONTH_DAY', day: Number(v.ruleDay), monthsAfter: Number(v.ruleMonths) },
    };
    return contract ? api.patch(`/contracts/${contract.id}`, body) : api.post('/contracts', body);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync(undefined);
      toast('Vínculo salvo');
      onOpenChange(false);
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const v = f.values;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} wide title={contract ? 'Editar vínculo' : 'Novo vínculo'}
        description="Cada vínculo tem sua própria regra tributária."
        footer={<Button form="contract-form" type="submit" loading={save.isPending}>Salvar vínculo</Button>}>
        <form id="contract-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instituição" htmlFor="c-inst">
              <div className="flex gap-2">
                <Select id="c-inst" required {...f.bind('institutionId')}>
                  <option value="">Selecione…</option>
                  {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
                <Button type="button" variant="outline" size="icon" aria-label="Nova instituição" onClick={() => setInstOpen(true)}><Plus className="h-4 w-4" /></Button>
              </div>
            </Field>
            <Field label="Nome do vínculo" htmlFor="c-title" hint="Ex.: Plantões UTI, Preceptoria, CLT ambulatório">
              <Input id="c-title" required {...f.bind('title')} />
            </Field>
            <Field label="Tipo de vínculo" htmlFor="c-type">
              <Select id="c-type" {...f.bind('type')}>
                {['CLT', 'PJ', 'PF', 'COOPERATIVA', 'OUTRO'].map((t) => <option key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Regra tributária" htmlFor="c-tax" hint={!v.taxProfileId ? 'Sem perfil, o imposto fica como "não configurado" (zero).' : undefined}>
              <div className="flex gap-2">
                <Select id="c-tax" {...f.bind('taxProfileId')}>
                  <option value="">Não configurada</option>
                  {taxProfiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Button type="button" variant="outline" size="icon" aria-label="Novo perfil tributário" onClick={() => setTaxOpen(true)}><Plus className="h-4 w-4" /></Button>
              </div>
            </Field>
            {v.type === 'PJ' && (companies.data?.length ?? 0) > 0 && (
              <Field label="Empresa (PJ)" htmlFor="c-company">
                <Select id="c-company" {...f.bind('companyId')}>
                  <option value="">—</option>
                  {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Início do contrato" htmlFor="c-start"><Input id="c-start" type="date" required {...f.bind('startDate')} /></Field>
            <Field label="Término (opcional)" htmlFor="c-end"><Input id="c-end" type="date" {...f.bind('endDate')} /></Field>
          </div>

          <div className="rounded-2xl border p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={v.hasSalary} onChange={(e) => f.set('hasSalary')(e.target.checked)} />
              Possui remuneração fixa mensal (salário, pró-labore, contrato fixo)
            </label>
            {v.hasSalary && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Valor bruto mensal" htmlFor="c-gross"><MoneyInput id="c-gross" required value={v.grossSalary} onChange={f.set('grossSalary')} /></Field>
                  <Field label="Dia(s) de pagamento" htmlFor="c-days" hint="Quinzenal: 5, 20"><Input id="c-days" {...f.bind('payDays')} /></Field>
                  <Field label="Pago em" htmlFor="c-offset">
                    <Select id="c-offset" {...f.bind('payMonthOffset')}>
                      <option value="0">No próprio mês</option>
                      <option value="1">No mês seguinte</option>
                      <option value="2">Dois meses depois</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <NamedList label="Adicionais e benefícios (somados ao bruto)" value={additions} onChange={setAdditions} />
                  <NamedList label="Descontos recorrentes (após impostos)" value={deductions} onChange={setDeductions} />
                </div>
                <Field label="Acompanhar a partir de" htmlFor="c-track" hint="Meses anteriores não serão gerados como 'a receber'. Padrão: mês atual.">
                  <Input id="c-track" type="date" {...f.bind('trackFrom')} />
                </Field>
              </div>
            )}
          </div>

          <Field label="Pagamento de plantões deste vínculo" htmlFor="c-rule">
            <Select id="c-rule" {...f.bind('ruleMode')}>
              <option value="INHERIT">Usar a regra da instituição</option>
              <option value="MONTH_DAY">Dia fixo em mês posterior</option>
              <option value="DAYS_AFTER">X dias após o plantão</option>
            </Select>
          </Field>
          {v.ruleMode === 'MONTH_DAY' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia" htmlFor="c-rd"><Input id="c-rd" type="number" min={1} max={31} {...f.bind('ruleDay')} /></Field>
              <Field label="Meses após" htmlFor="c-rm"><Input id="c-rm" type="number" min={0} max={12} {...f.bind('ruleMonths')} /></Field>
            </div>
          )}
          {v.ruleMode === 'DAYS_AFTER' && <Field label="Dias após o plantão" htmlFor="c-rdays"><Input id="c-rdays" type="number" min={0} {...f.bind('ruleDays')} /></Field>}
        </form>
      </Dialog>
      {instOpen && <InstitutionForm open={instOpen} onOpenChange={setInstOpen} onSaved={(i) => f.set('institutionId')(i.id)} />}
      {taxOpen && <TaxProfileForm open={taxOpen} onOpenChange={setTaxOpen} onSaved={(p) => f.set('taxProfileId')(p.id)} />}
    </>
  );
}
