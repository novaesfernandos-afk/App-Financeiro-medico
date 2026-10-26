import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { Badge } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { fmtBRL, fmtHours, todayISO } from '@/lib/format';
import { SHIFT_STATUS_LABEL, SHIFT_TYPE_LABEL, TAX_STATUS_LABEL } from '@/lib/labels';
import { useApiMutation, useContracts, useInstitutions, useTaxProfiles } from '@/lib/queries';
import { nn, undef, useFormState } from './useFormState';

/**
 * Registro de plantão. Valor, horários e data de pagamento vêm da tabela da instituição
 * quando não informados; o cálculo exibido vem do mesmo motor usado no dashboard.
 */
export function ShiftForm({ open, onOpenChange, shift, defaultDate }: { open: boolean; onOpenChange: (o: boolean) => void; shift?: any; defaultDate?: string }) {
  const toast = useToast();
  const institutions = useInstitutions();
  const contracts = useContracts();
  const taxProfiles = useTaxProfiles();
  const [duplicate, setDuplicate] = useState(false);
  const f = useFormState({
    institutionId: shift?.institutionId ?? '',
    contractId: shift?.contractId ?? '',
    unit: shift?.unit ?? '',
    date: shift?.date ?? defaultDate ?? todayISO(),
    type: shift?.type ?? 'DIURNO',
    startTime: shift?.startTime ?? '',
    endTime: shift?.endTime ?? '',
    pricingMode: shift?.pricingMode ?? 'PER_SHIFT',
    amount: shift?.amount ?? '',
    additionalPercent: shift?.additionalPercent ?? '',
    bonuses: shift?.bonuses ?? '',
    deductions: shift?.deductions ?? '',
    taxProfileId: shift?.taxProfileId ?? '',
    status: shift?.status ?? (defaultDate && defaultDate > todayISO() ? 'AGENDADO' : 'REALIZADO'),
    expectedPaymentDate: shift?.expectedPaymentDate ?? '',
    receivedDate: shift?.receivedDate ?? '',
    receivedAmount: shift?.receivedAmount ?? '',
    notes: shift?.notes ?? '',
  });
  const v = f.values;
  const instContracts = useMemo(() => contracts.data?.filter((c) => c.institutionId === v.institutionId && c.active) ?? [], [contracts.data, v.institutionId]);

  useEffect(() => {
    if (!shift && instContracts.length === 1 && !v.contractId) f.set('contractId')(instContracts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instContracts]);

  const body = () => ({
    institutionId: v.institutionId, contractId: nn(v.contractId), unit: nn(v.unit), date: v.date, type: v.type,
    startTime: undef(v.startTime), endTime: undef(v.endTime), pricingMode: v.amount ? v.pricingMode : undefined,
    amount: undef(v.amount), additionalPercent: nn(v.additionalPercent), bonuses: nn(v.bonuses), deductions: nn(v.deductions),
    taxProfileId: nn(v.taxProfileId), status: v.status, expectedPaymentDate: undef(v.expectedPaymentDate),
    receivedDate: v.status === 'RECEBIDO' ? undef(v.receivedDate) : null,
    receivedAmount: v.status === 'RECEBIDO' ? nn(v.receivedAmount) : null,
    notes: nn(v.notes),
  });

  // Pré-visualização do cálculo (debounce)
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    if (!v.institutionId || !v.date) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await api.post('/shifts/preview', body());
        setPreview(p);
        setPreviewError('');
        if (!v.expectedPaymentDate && !shift) f.set('expectedPaymentDate')(p.expectedPaymentDate);
      } catch (e) {
        setPreview(null);
        setPreviewError(errorMessage(e));
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.institutionId, v.contractId, v.date, v.type, v.startTime, v.endTime, v.pricingMode, v.amount, v.additionalPercent, v.bonuses, v.deductions, v.taxProfileId]);

  const save = useApiMutation(async (allowDuplicate: boolean) =>
    shift ? api.patch(`/shifts/${shift.id}`, body()) : api.post('/shifts', { ...body(), allowDuplicate }));

  async function submit(e: React.FormEvent, allowDuplicate = false) {
    e.preventDefault();
    try {
      await save.mutateAsync(allowDuplicate);
      toast(shift ? 'Plantão atualizado' : 'Plantão registrado');
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && !shift) setDuplicate(true);
      else toast(errorMessage(err), 'error');
    }
  }

  const values = preview?.values;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={shift ? 'Editar plantão' : 'Registrar plantão'}
      footer={
        duplicate ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-warning">Já existe plantão nesta instituição, data e horário.</p>
            <Button variant="outline" onClick={(e) => submit(e, true)} loading={save.isPending}>Registrar mesmo assim</Button>
          </div>
        ) : <Button form="shift-form" type="submit" loading={save.isPending}>Salvar plantão</Button>
      }>
      <form id="shift-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instituição" htmlFor="s-inst">
            <Select id="s-inst" required value={v.institutionId} onChange={(e) => { f.set('institutionId')(e.target.value); f.set('contractId')(''); setDuplicate(false); }}>
              <option value="">Selecione…</option>
              {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label="Vínculo" htmlFor="s-contract" hint="Define imposto e regra de pagamento.">
            <Select id="s-contract" {...f.bind('contractId')}>
              <option value="">Avulso (sem vínculo)</option>
              {instContracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Data do plantão" htmlFor="s-date"><Input id="s-date" type="date" required value={v.date} onChange={(e) => { f.set('date')(e.target.value); f.set('expectedPaymentDate')(''); setDuplicate(false); }} /></Field>
          <Field label="Tipo" htmlFor="s-type">
            <Select id="s-type" {...f.bind('type')}>
              {Object.entries(SHIFT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" htmlFor="s-start"><Input id="s-start" type="time" {...f.bind('startTime')} placeholder={preview?.startTime} /></Field>
            <Field label="Término" htmlFor="s-end"><Input id="s-end" type="time" {...f.bind('endTime')} /></Field>
          </div>
          <Field label="Unidade / setor" htmlFor="s-unit"><Input id="s-unit" placeholder="UTI, PS, CC…" {...f.bind('unit')} /></Field>
        </div>

        <div className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-4">
          <Field label="Cobrança" htmlFor="s-pm">
            <Select id="s-pm" {...f.bind('pricingMode')}>
              <option value="PER_SHIFT">Por plantão</option>
              <option value="PER_HOUR">Por hora</option>
            </Select>
          </Field>
          <Field label={v.pricingMode === 'PER_HOUR' ? 'Valor/hora' : 'Valor bruto'} htmlFor="s-amount" hint={!v.amount && preview ? `Tabela: ${fmtBRL(preview.amount)}` : undefined}>
            <MoneyInput id="s-amount" value={v.amount} onChange={f.set('amount')} placeholder={preview ? preview.amount.replace('.', ',') : '0,00'} />
          </Field>
          <Field label="Adicional (%)" htmlFor="s-add" hint="Noturno/feriado"><Input id="s-add" inputMode="decimal" {...f.bind('additionalPercent')} /></Field>
          <Field label="Bonificação" htmlFor="s-bonus"><MoneyInput id="s-bonus" value={v.bonuses} onChange={f.set('bonuses')} /></Field>
          <Field label="Descontos" htmlFor="s-ded" hint="Após impostos"><MoneyInput id="s-ded" value={v.deductions} onChange={f.set('deductions')} /></Field>
          <Field label="Imposto deste plantão" htmlFor="s-tax" className="sm:col-span-3">
            <Select id="s-tax" {...f.bind('taxProfileId')}>
              <option value="">Herdar do vínculo</option>
              {taxProfiles.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        </div>

        {values && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-4 text-sm sm:grid-cols-4" data-testid="shift-preview">
            <div><p className="text-xs text-muted">Duração</p><p className="font-medium tabular">{fmtHours(values.hours)}</p></div>
            <div><p className="text-xs text-muted">Bruto</p><p className="font-medium tabular">{fmtBRL(values.gross)}</p></div>
            <div><p className="text-xs text-muted">Imposto</p><p className="font-medium tabular">{fmtBRL(values.tax.total)}</p>
              <Badge tone={values.tax.status === 'NOT_CONFIGURED' ? 'warning' : values.tax.status === 'CONFIRMED' ? 'positive' : 'info'}>{TAX_STATUS_LABEL[values.tax.status]}</Badge></div>
            <div><p className="text-xs text-muted">Líquido previsto</p><p className="font-semibold text-positive tabular">{fmtBRL(values.net)}</p><p className="text-[11px] text-muted">{fmtBRL(values.netPerHour)}/h</p></div>
          </div>
        )}
        {previewError && <p className="text-xs text-warning">{previewError}</p>}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status" htmlFor="s-status">
            <Select id="s-status" {...f.bind('status')}>
              {Object.entries(SHIFT_STATUS_LABEL).filter(([k]) => k !== 'ATRASADO').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Pagamento previsto" htmlFor="s-pay" hint="Data em que o dinheiro deve entrar"><Input id="s-pay" type="date" {...f.bind('expectedPaymentDate')} /></Field>
          {v.status === 'RECEBIDO' && (
            <>
              <Field label="Recebido em" htmlFor="s-recd"><Input id="s-recd" type="date" {...f.bind('receivedDate')} /></Field>
              <Field label="Valor líquido recebido" htmlFor="s-reca" hint="Vazio = usa o líquido calculado"><MoneyInput id="s-reca" value={v.receivedAmount} onChange={f.set('receivedAmount')} /></Field>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
