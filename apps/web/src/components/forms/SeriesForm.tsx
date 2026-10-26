import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { SHIFT_TYPE_LABEL, WEEKDAYS } from '@/lib/labels';
import { useApiMutation, useContracts, useInstitutions } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { nn, undef, useFormState } from './useFormState';

/** Escala recorrente: semanal, quinzenal, a cada N dias (12x36, 24x72) ou dias fixos do mês. */
export function SeriesForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const institutions = useInstitutions();
  const contracts = useContracts();
  const start = todayISO();
  const f = useFormState({
    institutionId: '', contractId: '', type: 'DIURNO', startTime: '', endTime: '', amount: '',
    frequency: 'WEEKLY', weekdays: [] as number[], interval: '2', monthDays: '', startDate: start,
    until: new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) + 2, 0)).toISOString().slice(0, 10),
  });
  const v = f.values;
  const instContracts = useMemo(() => contracts.data?.filter((c) => c.institutionId === v.institutionId && c.active) ?? [], [contracts.data, v.institutionId]);

  const save = useApiMutation(async () => api.post('/shifts/series', {
    institutionId: v.institutionId, contractId: nn(v.contractId),
    rule: {
      frequency: v.frequency, startDate: v.startDate, until: v.until,
      weekdays: ['WEEKLY', 'BIWEEKLY'].includes(v.frequency) ? v.weekdays : undefined,
      interval: v.frequency === 'EVERY_N_DAYS' ? Number(v.interval) : undefined,
      monthDays: v.frequency === 'MONTHLY' ? v.monthDays.split(/[,;\s]+/).map(Number).filter(Boolean) : undefined,
    },
    template: { type: v.type, startTime: undef(v.startTime), endTime: undef(v.endTime), amount: undef(v.amount) },
  }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await save.mutateAsync(undefined);
      toast(`${r.created} plantões agendados${r.skipped ? ` (${r.skipped} já existiam)` : ''}`);
      onOpenChange(false);
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Escala recorrente"
      description="Gera plantões agendados. Reprocessar ou estender a escala nunca duplica datas."
      footer={<Button form="series-form" type="submit" loading={save.isPending}>Gerar escala</Button>}>
      <form id="series-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instituição" htmlFor="sr-inst">
            <Select id="sr-inst" required value={v.institutionId} onChange={(e) => { f.set('institutionId')(e.target.value); f.set('contractId')(''); }}>
              <option value="">Selecione…</option>
              {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label="Vínculo" htmlFor="sr-c">
            <Select id="sr-c" {...f.bind('contractId')}>
              <option value="">Avulso</option>
              {instContracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="sr-type">
            <Select id="sr-type" {...f.bind('type')}>{Object.entries(SHIFT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Valor (vazio = tabela da instituição)" htmlFor="sr-amount"><MoneyInput id="sr-amount" value={v.amount} onChange={f.set('amount')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" htmlFor="sr-st"><Input id="sr-st" type="time" {...f.bind('startTime')} /></Field>
            <Field label="Término" htmlFor="sr-et"><Input id="sr-et" type="time" {...f.bind('endTime')} /></Field>
          </div>
          <Field label="Frequência" htmlFor="sr-freq">
            <Select id="sr-freq" {...f.bind('frequency')}>
              <option value="WEEKLY">Toda semana</option>
              <option value="BIWEEKLY">Semana sim, semana não</option>
              <option value="EVERY_N_DAYS">A cada N dias (12x36, 24x72…)</option>
              <option value="MONTHLY">Dias fixos do mês</option>
            </Select>
          </Field>
        </div>
        {['WEEKLY', 'BIWEEKLY'].includes(v.frequency) && (
          <Field label="Dias da semana">
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => {
                const on = v.weekdays.includes(i);
                return (
                  <button key={d} type="button" aria-pressed={on}
                    onClick={() => f.set('weekdays')(on ? v.weekdays.filter((x) => x !== i) : [...v.weekdays, i])}
                    className={cn('h-9 w-12 rounded-xl border text-xs font-medium', on ? 'border-primary bg-primary text-primary-fg' : 'hover:bg-surface-2')}>
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {v.frequency === 'EVERY_N_DAYS' && <Field label="Intervalo em dias" htmlFor="sr-int" hint="12x36 = 2; 24x72 = 4"><Input id="sr-int" type="number" min={1} {...f.bind('interval')} /></Field>}
        {v.frequency === 'MONTHLY' && <Field label="Dias do mês" htmlFor="sr-md" hint="Ex.: 1, 15"><Input id="sr-md" {...f.bind('monthDays')} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="De" htmlFor="sr-from"><Input id="sr-from" type="date" required {...f.bind('startDate')} /></Field>
          <Field label="Até" htmlFor="sr-until"><Input id="sr-until" type="date" required {...f.bind('until')} /></Field>
        </div>
      </form>
    </Dialog>
  );
}
