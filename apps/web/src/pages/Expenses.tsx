import { CheckCheck, CreditCard, Pencil, Plus, Receipt, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExpenseForm } from '@/components/forms/ExpenseForm';
import { MonthPicker } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui/misc';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { shiftMonth, useMonth } from '@/hooks/useMonth';
import { api, errorMessage, qs } from '@/lib/api';
import { fmtBRL, fmtDate, fmtMonth, todayISO } from '@/lib/format';
import { PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { useApiMutation, useCategories, useList } from '@/lib/queries';

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return { from: `${ym}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

export default function Expenses() {
  const toast = useToast();
  const [month, setMonth] = useMonth();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const categories = useCategories();
  const list = useList<any[]>(['expenses', month], `/expenses?month=${month}`);
  const prev = useList<any[]>(['expenses', shiftMonth(month, -1)], `/expenses?month=${shiftMonth(month, -1)}`);
  const { from, to } = monthBounds(month);
  const invoices = useList<any>(['ledger-invoices', month], `/ledger${qs({ from, to, basis: 'cash', source: 'CARD_INVOICE' })}`);

  const payMut = useApiMutation((e: any) => api.patch(`/expenses/${e.id}`, { status: 'PAGO', paidDate: todayISO() }));
  const delMut = useApiMutation(({ id, group }: { id: string; group: boolean }) => api.del(`/expenses/${id}${group ? '?group=true' : ''}`));
  const invoiceMut = useApiMutation((i: any) => api.put('/card-invoices', { cardId: i.refId, reference: i.key.split(':')[2], paidDate: todayISO(), amount: i.net }));

  const rows = (list.data ?? []).filter((e) => e.status !== 'CANCELADO');
  const total = rows.reduce((a, e) => a + Number(e.amount), 0);
  const paid = rows.filter((e) => e.status === 'PAGO').reduce((a, e) => a + Number(e.amount), 0);
  const onCard = rows.filter((e) => e.paymentMethod === 'CARTAO_CREDITO').reduce((a, e) => a + Number(e.amount), 0);

  // Orçamento e variação vs mês anterior por categoria
  const byCat = useMemo(() => {
    const sumBy = (arr: any[]) => arr.filter((e) => e.status !== 'CANCELADO').reduce<Record<string, number>>((acc, e) => {
      const k = e.categoryId ?? 'none';
      acc[k] = (acc[k] ?? 0) + Number(e.amount);
      return acc;
    }, {});
    const cur = sumBy(list.data ?? []);
    const before = sumBy(prev.data ?? []);
    return Object.entries(cur).map(([id, value]) => {
      const cat = categories.data?.find((c) => c.id === id);
      const previous = before[id] ?? 0;
      return { id, name: cat?.name ?? 'Sem categoria', color: cat?.color ?? '#64748b', value, previous, budget: cat?.monthlyBudget ? Number(cat.monthlyBudget) : null,
        atypical: previous > 0 && value > previous * 1.3 && value - previous > 100 };
    }).sort((a, b) => b.value - a.value);
  }, [list.data, prev.data, categories.data]);

  const today = todayISO();
  return (
    <div>
      <PageHeader title="Despesas" subtitle="Pessoais e profissionais. Compras no cartão contam na data da compra; a fatura é só o pagamento."
        actions={<><MonthPicker value={month} onChange={setMonth} /><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Despesa</Button></>} />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total do mês" value={fmtBRL(total)} note="Competência" />
        <Stat label="Pago" value={fmtBRL(paid)} tone="positive" />
        <Stat label="Pendente" value={fmtBRL(total - paid - onCard)} tone={total - paid - onCard > 0 ? 'warning' : undefined} />
        <Stat label="No cartão" icon={<CreditCard className="h-4 w-4" />} value={fmtBRL(onCard)} note="Quitadas via fatura" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {list.isLoading ? <PageLoader /> : rows.length === 0 ? (
            <EmptyState icon={<Receipt className="h-8 w-8" />} title="Nenhuma despesa neste mês" action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Lançar despesa</Button>} />
          ) : (
            <Card className="p-0">
              <ul className="divide-y" data-testid="expense-list">
                {rows.map((e) => {
                  const overdue = e.status === 'PENDENTE' && e.paymentMethod !== 'CARTAO_CREDITO' && e.dueDate < today;
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: e.category?.color ?? '#64748b' }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.description}{e.installmentCount ? <span className="font-normal text-muted"> ({e.installmentNumber}/{e.installmentCount})</span> : null}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <span>{e.category?.name ?? 'Sem categoria'}</span>
                          <span>· {PAYMENT_METHOD_LABEL[e.paymentMethod]}{e.creditCard ? ` ${e.creditCard.name}` : ''}</span>
                          <span>· {e.paymentMethod === 'CARTAO_CREDITO' ? `compra ${fmtDate(e.competenceDate, { day: '2-digit', month: '2-digit' })}` : `vence ${fmtDate(e.dueDate, { day: '2-digit', month: '2-digit' })}`}</span>
                          {e.category?.isTax && <Badge tone="negative">Tributo</Badge>}
                          {e.isFixed && <Badge>Fixa</Badge>}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular">{fmtBRL(e.amount)}</p>
                      {e.paymentMethod === 'CARTAO_CREDITO' ? <Badge tone="primary">Fatura</Badge>
                        : e.status === 'PAGO' ? <Badge tone="positive">Paga</Badge>
                        : overdue ? <Badge tone="negative">Vencida</Badge> : <Badge tone="warning">Pendente</Badge>}
                      <div className="flex shrink-0">
                        {e.status === 'PENDENTE' && e.paymentMethod !== 'CARTAO_CREDITO' && (
                          <Button size="icon" variant="ghost" aria-label="Marcar como paga" onClick={async () => { try { await payMut.mutateAsync(e); toast('Despesa paga'); } catch (err) { toast(errorMessage(err), 'error'); } }}><CheckCheck className="h-4 w-4" /></Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => setDeleting(e)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Faturas com vencimento no mês" subtitle="Pagamento de fatura é transferência — não soma como despesa" />
            {!invoices.data?.items.length ? <p className="text-sm text-muted">Nenhuma fatura.</p> : (
              <ul className="space-y-2">
                {invoices.data.items.map((i: any) => (
                  <li key={i.key} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                    <div><p className="font-medium">{i.title}</p><p className="text-xs text-muted">vence {fmtDate(i.cashDate)}</p></div>
                    <div className="text-right">
                      <p className="font-semibold tabular">{fmtBRL(i.net)}</p>
                      {i.cashStatus === 'DONE' ? <Badge tone="positive">Paga</Badge> : (
                        <Button size="sm" variant="outline" onClick={async () => { try { await invoiceMut.mutateAsync(i); toast('Fatura paga'); } catch (err) { toast(errorMessage(err), 'error'); } }}>Pagar</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Por categoria" subtitle={`Comparado a ${fmtMonth(shiftMonth(month, -1))}`} />
            {byCat.length === 0 ? <p className="text-sm text-muted">Sem dados.</p> : (
              <ul className="space-y-3">
                {byCat.map((c) => (
                  <li key={c.id} className="text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: c.color }} />{c.name}
                        {c.atypical && <Badge tone="warning"><TrendingUp className="h-3 w-3" /> +{Math.round((c.value / c.previous - 1) * 100)}%</Badge>}
                      </span>
                      <span className="tabular font-medium">{fmtBRL(c.value)}{c.budget ? <span className="font-normal text-muted"> / {fmtBRL(c.budget, { compact: true })}</span> : null}</span>
                    </div>
                    {c.budget && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={c.value} aria-valuemax={c.budget} aria-label={`Orçamento ${c.name}`}>
                        <div className={`h-full rounded-full ${c.value > c.budget ? 'bg-negative' : 'bg-accent'}`} style={{ width: `${Math.min(100, (c.value / c.budget) * 100)}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {creating && <ExpenseForm open onOpenChange={setCreating} />}
      {editing && <ExpenseForm open expense={editing} onOpenChange={(o) => !o && setEditing(null)} />}
      {deleting && (
        <ConfirmDialog open onOpenChange={(o) => !o && setDeleting(null)} danger confirmLabel={deleting.installmentGroupId || deleting.recurringGroupId ? 'Excluir esta e as próximas' : 'Excluir'}
          title="Excluir despesa"
          description={deleting.installmentGroupId || deleting.recurringGroupId ? 'Esta despesa faz parte de um parcelamento/recorrência. Serão excluídas esta e as próximas ainda não pagas.' : 'A despesa será removida do painel e do calendário.'}
          onConfirm={async () => {
            try { const r = await delMut.mutateAsync({ id: deleting.id, group: Boolean(deleting.installmentGroupId || deleting.recurringGroupId) }); toast(`${r.removed} lançamento(s) excluído(s)`); setDeleting(null); } catch (err) { toast(errorMessage(err), 'error'); }
          }} />
      )}
    </div>
  );
}
