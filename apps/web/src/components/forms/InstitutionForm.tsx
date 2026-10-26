import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { INSTITUTION_KIND_LABEL } from '@/lib/labels';
import { useApiMutation } from '@/lib/queries';
import { useFormState } from './useFormState';

const COLORS = ['#0e7490', '#059669', '#2563eb', '#7c3aed', '#d97706', '#db2777', '#0891b2', '#65a30d'];

export function InstitutionForm({ open, onOpenChange, institution, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; institution?: any; onSaved?: (i: any) => void }) {
  const toast = useToast();
  const rule = institution?.paymentRule;
  const f = useFormState({
    name: institution?.name ?? '',
    kind: institution?.kind ?? 'HOSPITAL',
    color: institution?.color ?? COLORS[0]!,
    ruleMode: rule?.mode ?? 'MONTH_DAY',
    day: String(rule?.day ?? 10),
    monthsAfter: String(rule?.monthsAfter ?? 1),
    days: String(rule?.days ?? 30),
  });
  const save = useApiMutation(async () => {
    const v = f.values;
    const body = {
      name: v.name, kind: v.kind, color: v.color,
      paymentRule: v.ruleMode === 'NONE' ? null : v.ruleMode === 'DAYS_AFTER'
        ? { mode: 'DAYS_AFTER', days: Number(v.days) }
        : { mode: 'MONTH_DAY', day: Number(v.day), monthsAfter: Number(v.monthsAfter) },
    };
    return institution ? api.patch(`/institutions/${institution.id}`, body) : api.post('/institutions', body);
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await save.mutateAsync(undefined);
      toast('Instituição salva');
      onSaved?.(r);
      onOpenChange(false);
    } catch (err) { toast(errorMessage(err), 'error'); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={institution ? 'Editar instituição' : 'Nova instituição'}
      footer={<Button form="inst-form" type="submit" loading={save.isPending}>Salvar</Button>}>
      <form id="inst-form" onSubmit={submit} className="space-y-4">
        <Field label="Nome" htmlFor="inst-name"><Input id="inst-name" required {...f.bind('name')} placeholder="Hospital, clínica, universidade…" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="inst-kind">
            <Select id="inst-kind" {...f.bind('kind')}>
              {Object.entries(INSTITUTION_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Cor no calendário">
            <div className="flex flex-wrap gap-2 pt-1">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => f.set('color')(c)}
                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-surface ${f.values.color === c ? 'ring-2 ring-fg' : ''}`} style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Quando a instituição paga os plantões?" htmlFor="inst-rule" hint="Define a data prevista de recebimento de cada plantão (pode ser ajustada no lançamento).">
          <Select id="inst-rule" {...f.bind('ruleMode')}>
            <option value="MONTH_DAY">Em um dia fixo do mês seguinte (ou outro)</option>
            <option value="DAYS_AFTER">X dias após o plantão</option>
            <option value="NONE">Não sei / informar manualmente</option>
          </Select>
        </Field>
        {f.values.ruleMode === 'MONTH_DAY' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia do pagamento" htmlFor="inst-day"><Input id="inst-day" type="number" min={1} max={31} {...f.bind('day')} /></Field>
            <Field label="Meses após o plantão" htmlFor="inst-ma"><Input id="inst-ma" type="number" min={0} max={12} {...f.bind('monthsAfter')} /></Field>
          </div>
        )}
        {f.values.ruleMode === 'DAYS_AFTER' && (
          <Field label="Dias após o plantão" htmlFor="inst-days"><Input id="inst-days" type="number" min={0} max={365} {...f.bind('days')} /></Field>
        )}
      </form>
    </Dialog>
  );
}
