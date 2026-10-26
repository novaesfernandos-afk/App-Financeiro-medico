import { Briefcase, CheckCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ContractForm } from '@/components/forms/ContractForm';
import { IncomeForm } from '@/components/forms/IncomeForm';
import { MonthPicker } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, CertaintyDot, EmptyState, PageHeader, PageLoader, Segmented } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useMonth } from '@/hooks/useMonth';
import { api, errorMessage, qs } from '@/lib/api';
import { fmtBRL, fmtDate, todayISO } from '@/lib/format';
import { CERTAINTY_LABEL, CONTRACT_TYPE_LABEL, INCOME_CATEGORY_LABEL, TAX_STATUS_LABEL } from '@/lib/labels';
import { useApiMutation, useContracts, useList } from '@/lib/queries';

type Tab = 'ledger' | 'receivables' | 'contracts' | 'other';

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

export default function Incomes() {
  const [tab, setTab] = useState<Tab>('ledger');
  const [month, setMonth] = useMonth();
  return (
    <div>
      <PageHeader title="Receitas" subtitle="Vínculos fixos, plantões e demais fontes de renda — previstas e recebidas separadamente."
        actions={(tab === 'ledger' || tab === 'other') && <MonthPicker value={month} onChange={setMonth} />} />
      <Segmented<Tab> className="mb-4" value={tab} onChange={setTab} options={[
        { value: 'ledger', label: 'Extrato do mês' },
        { value: 'receivables', label: 'A receber' },
        { value: 'contracts', label: 'Vínculos' },
        { value: 'other', label: 'Outras receitas' },
      ]} />
      {tab === 'ledger' && <LedgerTab month={month} />}
      {tab === 'receivables' && <ReceivablesTab />}
      {tab === 'contracts' && <ContractsTab />}
      {tab === 'other' && <OtherTab month={month} />}
    </div>
  );
}

function SourceBadge({ source, category }: { source: string; category: string | null }) {
  const label = source === 'SHIFT' ? 'Plantão' : source === 'SALARY' ? 'Vínculo fixo' : INCOME_CATEGORY_LABEL[category ?? 'OUTRA'];
  return <Badge tone={source === 'SHIFT' ? 'info' : source === 'SALARY' ? 'primary' : 'neutral'}>{label}</Badge>;
}

/** Marca um item do ledger como recebido no endpoint correto (plantão, salário ou receita). */
function useMarkReceived() {
  return useApiMutation(async (item: any) => {
    const date = todayISO();
    if (item.source === 'SHIFT') return api.patch(`/shifts/${item.refId}`, { status: 'RECEBIDO', receivedDate: date, receivedAmount: item.net });
    if (item.source === 'INCOME') return api.patch(`/incomes/${item.refId}`, { status: 'RECEBIDO', receivedDate: date, receivedAmount: item.net });
    const [, contractId, competence, index] = item.key.split(':');
    return api.put('/salary-payments', { contractId, competence, index: Number(index), receivedDate: date, receivedAmount: item.net });
  });
}

function LedgerRow({ item, names, onReceive }: { item: any; names: any; onReceive?: (i: any) => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3" title={item.trace}>
      <CertaintyDot certainty={item.certainty} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}{item.institutionId && names.institutions[item.institutionId] ? <span className="font-normal text-muted"> · {names.institutions[item.institutionId].name}</span> : null}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <SourceBadge source={item.source} category={item.incomeCategory} />
          <span>competência {fmtDate(item.competenceDate, { day: '2-digit', month: '2-digit' })}</span>
          <span>· {item.cashStatus === 'DONE' ? 'recebido' : 'previsto'} {fmtDate(item.cashDate, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
          {item.cashStatus === 'OVERDUE' && <Badge tone="negative">Atrasado</Badge>}
          {item.taxStatus && <Badge tone={item.taxStatus === 'NOT_CONFIGURED' ? 'warning' : item.taxStatus === 'CONFIRMED' ? 'positive' : 'neutral'}>{TAX_STATUS_LABEL[item.taxStatus]}</Badge>}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular">{fmtBRL(item.net)}</p>
        <p className="text-[11px] text-muted tabular">bruto {fmtBRL(item.gross)} · imp. {fmtBRL(item.tax)}</p>
      </div>
      {onReceive && item.cashStatus !== 'DONE' && (
        <Button size="icon" variant="ghost" aria-label="Marcar como recebido" title="Marcar como recebido hoje" onClick={() => onReceive(item)}><CheckCheck className="h-4 w-4" /></Button>
      )}
    </li>
  );
}

function LedgerTab({ month }: { month: string }) {
  const toast = useToast();
  const { from, to } = monthBounds(month);
  const q = useList<any>(['ledger', month], `/ledger${qs({ from, to, direction: 'IN' })}`);
  const mark = useMarkReceived();
  if (q.isLoading || !q.data) return <PageLoader />;
  const items = q.data.items.filter((i: any) => i.cashStatus !== 'CANCELLED');
  if (!items.length) return <EmptyState title="Sem receitas neste mês" description="Cadastre vínculos, plantões ou outras receitas." />;
  const sum = (f: (i: any) => boolean) => items.filter(f).reduce((a: number, i: any) => a + Number(i.net), 0);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
        {(['REAL', 'ESTIMATED', 'PROJECTED'] as const).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5"><CertaintyDot certainty={c} /> {CERTAINTY_LABEL[c]}: <b className="text-fg tabular">{fmtBRL(sum((i) => i.certainty === c))}</b></span>
        ))}
      </div>
      <Card className="p-0"><ul className="divide-y">{items.map((i: any) => <LedgerRow key={i.key} item={i} names={q.data.names} onReceive={async (it) => {
        try { await mark.mutateAsync(it); toast('Recebimento registrado'); } catch (e) { toast(errorMessage(e), 'error'); }
      }} />)}</ul></Card>
    </>
  );
}

function ReceivablesTab() {
  const toast = useToast();
  const q = useList<any>(['receivables'], '/receivables');
  const mark = useMarkReceived();
  if (q.isLoading || !q.data) return <PageLoader />;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Card><p className="text-xs text-muted">Total a receber</p><p className="mt-1 text-lg font-semibold tabular">{fmtBRL(q.data.total)}</p></Card>
        <Card><p className="text-xs text-muted">Em atraso</p><p className="mt-1 text-lg font-semibold tabular text-negative">{fmtBRL(q.data.overdue)}</p></Card>
      </div>
      {q.data.items.length === 0 ? <EmptyState title="Nada pendente" description="Todos os trabalhos realizados já foram recebidos." /> : (
        <Card className="p-0"><ul className="divide-y">{q.data.items.map((i: any) => <LedgerRow key={i.key} item={i} names={q.data.names} onReceive={async (it) => {
          try { await mark.mutateAsync(it); toast('Recebimento registrado'); } catch (e) { toast(errorMessage(e), 'error'); }
        }} />)}</ul></Card>
      )}
    </>
  );
}

function ContractsTab() {
  const toast = useToast();
  const contracts = useContracts();
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<any>(null);
  const del = useApiMutation((id: string) => api.del(`/contracts/${id}`));
  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo vínculo</Button></div>
      {contracts.isLoading ? <PageLoader /> : !contracts.data?.length ? (
        <EmptyState icon={<Briefcase className="h-8 w-8" />} title="Nenhum vínculo cadastrado" description="Cadastre cada relação de trabalho (CLT, PJ, PF, cooperativa) com sua regra tributária."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Cadastrar vínculo</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contracts.data.map((c) => (
            <Card key={c.id} className={c.active ? '' : 'opacity-60'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="text-xs text-muted">{c.institution.name}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Editar vínculo" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Excluir vínculo" onClick={() => setRemoving(c)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="primary">{CONTRACT_TYPE_LABEL[c.type]}</Badge>
                {c.taxProfile ? <Badge tone="positive">{c.taxProfile.name}</Badge> : <Badge tone="warning">Sem regra tributária</Badge>}
                {!c.active && <Badge>Encerrado</Badge>}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted">Fixo mensal</dt><dd className="font-medium tabular">{c.grossSalary ? fmtBRL(c.grossSalary) : 'Só plantões'}</dd></div>
                <div><dt className="text-muted">Pagamento</dt><dd>{c.grossSalary ? `dia ${c.payDays.join(' e ')} ${c.payMonthOffset ? 'do mês seguinte' : 'do mês'}` : '—'}</dd></div>
                <div><dt className="text-muted">Vigência</dt><dd>{fmtDate(c.startDate)} {c.endDate ? `– ${fmtDate(c.endDate)}` : '– atual'}</dd></div>
                <div><dt className="text-muted">Reajustes</dt><dd>{c.adjustments.length || '—'}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      {creating && <ContractForm open onOpenChange={setCreating} />}
      {editing && <ContractForm open contract={editing} onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} danger confirmLabel="Remover"
        title="Remover vínculo" description="Se houver plantões ou pagamentos registrados, o vínculo será apenas encerrado para preservar o histórico."
        onConfirm={async () => {
          try { const r = await del.mutateAsync(removing.id); toast(r.deactivated ? 'Vínculo encerrado (histórico preservado)' : 'Vínculo removido'); setRemoving(null); } catch (e) { toast(errorMessage(e), 'error'); }
        }} />
    </>
  );
}

function OtherTab({ month }: { month: string }) {
  const toast = useToast();
  const { from, to } = monthBounds(month);
  const q = useList<any[]>(['incomes', month], `/incomes${qs({ from, to })}`);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const del = useApiMutation((id: string) => api.del(`/incomes/${id}`));
  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nova receita</Button></div>
      {q.isLoading ? <PageLoader /> : !q.data?.length ? (
        <EmptyState title="Nenhuma receita avulsa no mês" description="Consultas, procedimentos, cirurgias, aulas, pareceres, distribuição de lucros…" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {q.data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.description}</p>
                  <p className="text-xs text-muted">{INCOME_CATEGORY_LABEL[r.category]} · {fmtDate(r.competenceDate)}{r.institution ? ` · ${r.institution.name}` : ''}</p>
                </div>
                <p className="text-sm font-semibold tabular">{fmtBRL(r.grossAmount)}</p>
                <Badge tone={r.status === 'RECEBIDO' ? 'positive' : r.status === 'CANCELADO' ? 'neutral' : 'warning'}>{r.status === 'PREVISTO' ? 'A receber' : r.status === 'RECEBIDO' ? 'Recebido' : 'Cancelado'}</Badge>
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Excluir" onClick={async () => { try { await del.mutateAsync(r.id); toast('Receita excluída'); } catch (e) { toast(errorMessage(e), 'error'); } }}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {creating && <IncomeForm open onOpenChange={setCreating} />}
      {editing && <IncomeForm open income={editing} onOpenChange={(o) => !o && setEditing(null)} />}
    </>
  );
}
