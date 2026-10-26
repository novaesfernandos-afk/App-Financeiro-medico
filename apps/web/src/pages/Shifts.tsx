import { CheckCheck, Pencil, Plus, Repeat, Stethoscope, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SeriesForm } from '@/components/forms/SeriesForm';
import { ShiftForm } from '@/components/forms/ShiftForm';
import { MonthPicker } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/form';
import { Badge, CertaintyDot, EmptyState, PageHeader, PageLoader } from '@/components/ui/misc';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { useMonth } from '@/hooks/useMonth';
import { api, errorMessage, qs } from '@/lib/api';
import { fmtBRL, fmtDate, fmtHours, todayISO } from '@/lib/format';
import { SHIFT_STATUS_LABEL, SHIFT_STATUS_TONE, SHIFT_TYPE_LABEL, TAX_STATUS_LABEL } from '@/lib/labels';
import { useApiMutation, useInstitutions, useList } from '@/lib/queries';

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

export default function Shifts() {
  const toast = useToast();
  const [month, setMonth] = useMonth();
  const [institutionId, setInstitutionId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const institutions = useInstitutions();
  const { from, to } = monthBounds(month);
  const shifts = useList<any[]>(['shifts', month, institutionId, status], `/shifts${qs({ from, to, institutionId, status })}`);

  const rows = shifts.data ?? [];
  const totals = useMemo(() => {
    const active = rows.filter((s) => s.computed.effectiveStatus !== 'CANCELADO');
    return {
      count: active.length,
      hours: active.reduce((a, s) => a + Number(s.computed.hours), 0),
      gross: active.reduce((a, s) => a + Number(s.computed.gross), 0),
      net: active.reduce((a, s) => a + Number(s.computed.net), 0),
    };
  }, [rows]);

  const bulkMut = useApiMutation((st: string) => api.post('/shifts/bulk-status', { ids: [...selected], status: st, confirm: true, receivedDate: st === 'RECEBIDO' ? todayISO() : undefined }));
  const quickMut = useApiMutation(({ id, status: st }: { id: string; status: string }) => api.patch(`/shifts/${id}`, { status: st }));
  const delMut = useApiMutation((id: string) => api.del(`/shifts/${id}`));

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div>
      <PageHeader title="Plantões" subtitle="Registro rápido, escalas recorrentes e acompanhamento de recebimento."
        actions={<>
          <MonthPicker value={month} onChange={(m) => { setMonth(m); setSelected(new Set()); }} />
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Plantão</Button>
          <Button variant="secondary" onClick={() => setSeriesOpen(true)}><Repeat className="h-4 w-4" /> Escala</Button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Plantões" value={totals.count} />
        <Stat label="Horas" value={fmtHours(String(totals.hours))} />
        <Stat label="Bruto" value={fmtBRL(totals.gross)} />
        <Stat label="Líquido previsto" value={fmtBRL(totals.net)} note={totals.hours ? `${fmtBRL(totals.net / totals.hours)}/h` : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Instituição" className="w-auto min-w-[180px]" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
          <option value="">Todas as instituições</option>
          {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(SHIFT_STATUS_LABEL).filter(([k]) => k !== 'ATRASADO').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        {selected.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-xs">
            {selected.size} selecionado(s):
            <Button size="sm" variant="outline" onClick={() => setBulk('REALIZADO')}>Realizados</Button>
            <Button size="sm" variant="outline" onClick={() => setBulk('FATURADO')}>Faturados</Button>
            <Button size="sm" onClick={() => setBulk('RECEBIDO')}><CheckCheck className="h-3.5 w-3.5" /> Recebidos</Button>
          </div>
        )}
      </div>

      {shifts.isLoading ? <PageLoader /> : rows.length === 0 ? (
        <EmptyState icon={<Stethoscope className="h-8 w-8" />} title="Nenhum plantão neste mês" description="Registre um plantão avulso ou gere uma escala recorrente."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Registrar plantão</Button>} />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y" data-testid="shift-list">
            {rows.map((s) => {
              const st = s.computed.effectiveStatus;
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <input type="checkbox" aria-label="Selecionar plantão" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: s.institution.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {fmtDate(s.date, { weekday: 'short', day: '2-digit', month: '2-digit' })} · {s.institution.name}
                      {s.unit && <span className="font-normal text-muted"> · {s.unit}</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{SHIFT_TYPE_LABEL[s.type]} {s.startTime}–{s.endTime} ({fmtHours(s.computed.hours)})</span>
                      <span>· paga {fmtDate(s.receivedDate ?? s.expectedPaymentDate, { day: '2-digit', month: '2-digit' })}</span>
                      {s.contract && <span>· {s.contract.title}</span>}
                      {s.computed.taxStatus === 'NOT_CONFIGURED' && <Badge tone="warning">{TAX_STATUS_LABEL.NOT_CONFIGURED}</Badge>}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block" title={s.computed.trace}>
                    <p className="text-sm font-semibold tabular">{fmtBRL(s.computed.net)}</p>
                    <p className="flex items-center justify-end gap-1 text-[11px] text-muted"><CertaintyDot certainty={s.computed.certainty} /> bruto {fmtBRL(s.computed.gross)}</p>
                  </div>
                  <Badge tone={SHIFT_STATUS_TONE[st]}>{SHIFT_STATUS_LABEL[st]}</Badge>
                  <div className="flex shrink-0 items-center">
                    {st !== 'RECEBIDO' && st !== 'CANCELADO' && (
                      <Button size="icon" variant="ghost" aria-label={st === 'AGENDADO' ? 'Marcar como realizado' : 'Marcar como recebido'} title={st === 'AGENDADO' ? 'Marcar como realizado' : 'Marcar como recebido'}
                        onClick={async () => {
                          try { await quickMut.mutateAsync({ id: s.id, status: st === 'AGENDADO' ? 'REALIZADO' : 'RECEBIDO' }); } catch (e) { toast(errorMessage(e), 'error'); }
                        }}>
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {creating && <ShiftForm open onOpenChange={setCreating} defaultDate={month === todayISO().slice(0, 7) ? todayISO() : `${month}-01`} />}
      {editing && <ShiftForm open shift={editing} onOpenChange={(o) => !o && setEditing(null)} />}
      {seriesOpen && <SeriesForm open onOpenChange={setSeriesOpen} />}
      <ConfirmDialog open={Boolean(bulk)} onOpenChange={(o) => !o && setBulk(null)} loading={bulkMut.isPending}
        title="Alterar status em lote"
        description={`Marcar ${selected.size} plantão(ões) como "${SHIFT_STATUS_LABEL[bulk ?? ''] ?? ''}"?${bulk === 'RECEBIDO' ? ' A data de recebimento será hoje e o valor recebido será o líquido calculado.' : ''}`}
        onConfirm={async () => {
          try { const r = await bulkMut.mutateAsync(bulk!); toast(`${r.updated} plantão(ões) atualizado(s)`); setSelected(new Set()); setBulk(null); } catch (e) { toast(errorMessage(e), 'error'); }
        }} />
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} danger confirmLabel="Excluir" loading={delMut.isPending}
        title="Excluir plantão" description="Esta ação remove o plantão e seus valores do painel e do calendário. Para registrar que não aconteceu, prefira o status Cancelado."
        onConfirm={async () => {
          try { await delMut.mutateAsync(deleting.id); toast('Plantão excluído'); setDeleting(null); } catch (e) { toast(errorMessage(e), 'error'); }
        }} />
    </div>
  );
}
