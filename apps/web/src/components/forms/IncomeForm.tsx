import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { INCOME_CATEGORY_LABEL } from '@/lib/labels';
import { useApiMutation, useContracts, useInstitutions, useTaxProfiles } from '@/lib/queries';
import { nn, undef, useFormState } from './useFormState';

const CATEGORIES = ['CONSULTA', 'PROCEDIMENTO', 'CIRURGIA', 'AULA_PRECEPTORIA', 'PARECER', 'TELEMEDICINA', 'BONIFICACAO', 'DISTRIBUICAO_LUCROS', 'PRO_LABORE', 'RENDIMENTO', 'OUTRA'];

export function IncomeForm({ open, onOpenChange, income }: { open: boolean; onOpenChange: (o: boolean) => void; income?: any }) {
  const toast = useToast();
  const institutions = useInstitutions();
  const contracts = useContracts();
  const taxProfiles = useTaxProfiles();
  const f = useFormState({
    description: income?.description ?? '', category: income?.category ?? 'CONSULTA',
    institutionId: income?.institutionId ?? '', contractId: income?.contractId ?? '', taxProfileId: income?.taxProfileId ?? '',
    competenceDate: income?.competenceDate ?? todayISO(), expectedPaymentDate: income?.expectedPaymentDate ?? '',
    grossAmount: income?.grossAmount ?? '', deductions: income?.deductions ?? '', confirmedTax: income?.confirmedTax ?? '',
    hours: income?.hours ?? '', status: income?.status ?? 'PREVISTO', receivedDate: income?.receivedDate ?? '', receivedAmount: income?.receivedAmount ?? '',
  });
  const v = f.values;
  const save = useApiMutation(async () => {
    const body = {
      description: v.description, category: v.category, institutionId: nn(v.institutionId), contractId: nn(v.contractId),
      taxProfileId: nn(v.taxProfileId), competenceDate: v.competenceDate, expectedPaymentDate: undef(v.expectedPaymentDate),
      grossAmount: v.grossAmount, deductions: nn(v.deductions), confirmedTax: nn(v.confirmedTax), hours: nn(v.hours),
      status: v.status, receivedDate: v.status === 'RECEBIDO' ? undef(v.receivedDate) : null, receivedAmount: v.status === 'RECEBIDO' ? nn(v.receivedAmount) : null,
    };
    return income ? api.patch(`/incomes/${income.id}`, body) : api.post('/incomes', body);
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { await save.mutateAsync(undefined); toast('Receita salva'); onOpenChange(false); } catch (err) { toast(errorMessage(err), 'error'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={income ? 'Editar receita' : 'Nova receita'}
      description="Consultas, procedimentos, cirurgias, aulas, pareceres, distribuição de lucros e outras."
      footer={<Button form="income-form" type="submit" loading={save.isPending}>Salvar</Button>}>
      <form id="income-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" htmlFor="i-desc" className="sm:col-span-2"><Input id="i-desc" required {...f.bind('description')} /></Field>
        <Field label="Categoria" htmlFor="i-cat">
          <Select id="i-cat" {...f.bind('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{INCOME_CATEGORY_LABEL[c]}</option>)}</Select>
        </Field>
        <Field label="Valor bruto" htmlFor="i-gross"><MoneyInput id="i-gross" required value={v.grossAmount} onChange={f.set('grossAmount')} /></Field>
        <Field label="Instituição (opcional)" htmlFor="i-inst">
          <Select id="i-inst" {...f.bind('institutionId')}>
            <option value="">—</option>
            {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="Vínculo (opcional)" htmlFor="i-contract">
          <Select id="i-contract" {...f.bind('contractId')}>
            <option value="">—</option>
            {contracts.data?.filter((c) => !v.institutionId || c.institutionId === v.institutionId).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="Data de competência" htmlFor="i-comp" hint="Quando o serviço foi prestado"><Input id="i-comp" type="date" required {...f.bind('competenceDate')} /></Field>
        <Field label="Recebimento previsto" htmlFor="i-exp"><Input id="i-exp" type="date" {...f.bind('expectedPaymentDate')} /></Field>
        <Field label="Regra tributária" htmlFor="i-tax" hint={v.category === 'DISTRIBUICAO_LUCROS' ? 'Lucros já tributados na PJ: em geral não use perfil aqui (confirme com seu contador).' : 'Vazio = herda do vínculo'}>
          <Select id="i-tax" {...f.bind('taxProfileId')}>
            <option value="">{v.contractId ? 'Herdar do vínculo' : 'Não configurada'}</option>
            {taxProfiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Imposto confirmado (opcional)" htmlFor="i-ctax" hint="Substitui a estimativa"><MoneyInput id="i-ctax" value={v.confirmedTax} onChange={f.set('confirmedTax')} /></Field>
        <Field label="Descontos" htmlFor="i-ded"><MoneyInput id="i-ded" value={v.deductions} onChange={f.set('deductions')} /></Field>
        <Field label="Horas dedicadas (opcional)" htmlFor="i-hours" hint="Para calcular valor por hora"><Input id="i-hours" inputMode="decimal" {...f.bind('hours')} /></Field>
        <Field label="Status" htmlFor="i-status">
          <Select id="i-status" {...f.bind('status')}>
            <option value="PREVISTO">Previsto / a receber</option><option value="RECEBIDO">Recebido</option><option value="CANCELADO">Cancelado</option>
          </Select>
        </Field>
        {v.status === 'RECEBIDO' && (
          <>
            <Field label="Recebido em" htmlFor="i-rd"><Input id="i-rd" type="date" {...f.bind('receivedDate')} /></Field>
            <Field label="Valor líquido recebido" htmlFor="i-ra"><MoneyInput id="i-ra" value={v.receivedAmount} onChange={f.set('receivedAmount')} /></Field>
          </>
        )}
      </form>
    </Dialog>
  );
}
