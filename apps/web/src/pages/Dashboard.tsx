import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Clock, Info, Landmark, PiggyBank, Plus, Receipt, Stethoscope, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GroupedBars, RankBars } from '@/components/charts';
import { ExpenseForm } from '@/components/forms/ExpenseForm';
import { IncomeForm } from '@/components/forms/IncomeForm';
import { ShiftForm } from '@/components/forms/ShiftForm';
import { MonthPicker } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/form';
import { EmptyState, PageHeader, PageLoader } from '@/components/ui/misc';
import { Stat } from '@/components/ui/stat';
import { useMonth } from '@/hooks/useMonth';
import { qs } from '@/lib/api';
import { fmtBRL, fmtHours, fmtMonth } from '@/lib/format';
import { CONTRACT_TYPE_LABEL } from '@/lib/labels';
import { useInstitutions, useList } from '@/lib/queries';

const shortMonth = (m: string) => fmtMonth(m, 'short').toLowerCase().replace(' de ', '/').replace('.', '');

export default function Dashboard() {
  const [month, setMonth] = useMonth();
  const [institutionId, setInstitutionId] = useState('');
  const [modality, setModality] = useState('');
  const [dialog, setDialog] = useState<'shift' | 'expense' | 'income' | null>(null);
  const institutions = useInstitutions();
  const url = `/dashboard${qs({ month, institutionIds: institutionId, modalities: modality })}`;
  const { data: d, isLoading } = useList<any>(['dashboard', month, institutionId, modality], url);

  const instName = (id: string) => d?.names.institutions[id]?.name ?? (id === 'sem-instituicao' ? 'Sem instituição' : '—');
  const k = d?.kpis;
  const hasData = d && d.last12.some((m: any) => Number(m.gross) > 0 || Number(m.expenses) > 0);
  const surplus = k ? Number(k.netRevenue) - Number(k.expenses) : 0;

  return (
    <div>
      <PageHeader
        title="Painel"
        subtitle={<>{fmtMonth(month)} · competência (trabalho realizado) e caixa (dinheiro efetivo)</>}
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button onClick={() => setDialog('shift')}><Plus className="h-4 w-4" /> Plantão</Button>
            <Button variant="secondary" onClick={() => setDialog('expense')}><Plus className="h-4 w-4" /> Despesa</Button>
            <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => setDialog('income')}><Plus className="h-4 w-4" /> Receita</Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Select aria-label="Filtrar por instituição" className="w-auto min-w-[180px]" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
          <option value="">Todas as instituições</option>
          {institutions.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Select aria-label="Filtrar por modalidade" className="w-auto min-w-[160px]" value={modality} onChange={(e) => setModality(e.target.value)}>
          <option value="">Todas as modalidades</option>
          {Object.entries(CONTRACT_TYPE_LABEL).map(([kk, l]) => <option key={kk} value={kk}>{l}</option>)}
        </Select>
      </div>

      {isLoading || !d ? <PageLoader /> : (
        <div className="space-y-5">
          {!hasData && (
            <EmptyState icon={<Stethoscope className="h-8 w-8" />} title="Nenhum lançamento ainda"
              description="Registre plantões, vínculos, receitas e despesas. O painel mostra apenas dados cadastrados por você — nada é inventado."
              action={<Button onClick={() => setDialog('shift')}><Plus className="h-4 w-4" /> Registrar primeiro plantão</Button>} />
          )}
          {k.entriesWithoutTax > 0 && (
            <Link to="/impostos" className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span><b>{k.entriesWithoutTax} lançamento(s)</b> sem regra tributária neste mês — o líquido está sem desconto de impostos. Configure um perfil tributário para o vínculo.</span>
            </Link>
          )}

          <section aria-label="Indicadores do mês" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Stat testId="kpi-gross" label="Receita bruta" icon={<ArrowUpRight className="h-4 w-4" />} value={fmtBRL(k.grossRevenue)} note="Trabalho realizado/devido no mês" />
            <Stat testId="kpi-net" label="Receita líquida estimada" icon={<Wallet className="h-4 w-4" />} value={fmtBRL(k.netRevenue)}
              note={<>Real {fmtBRL(k.netRevenueByCertainty.REAL, { compact: true })} · Estim. {fmtBRL(k.netRevenueByCertainty.ESTIMATED, { compact: true })} · Proj. {fmtBRL(k.netRevenueByCertainty.PROJECTED, { compact: true })}</>} />
            <Stat testId="kpi-received" label="Efetivamente recebido" tone="positive" value={fmtBRL(k.receivedRevenue)} note="Entradas de caixa no mês" />
            <Stat testId="kpi-expenses" label="Despesas" icon={<ArrowDownRight className="h-4 w-4" />} value={fmtBRL(k.expenses)} note={`Pagas no mês: ${fmtBRL(k.expensesPaid)}`} />
            <Stat testId="kpi-taxes" label="Impostos provisionados" icon={<Landmark className="h-4 w-4" />} value={fmtBRL(k.taxesProvisioned)}
              note={`Retido ${fmtBRL(k.taxesWithheld, { compact: true })} · pago ${fmtBRL(k.taxesPaid, { compact: true })}`} />
            <Stat testId="kpi-balance" label="Saldo disponível" value={k.availableBalance === null ? '—' : fmtBRL(k.availableBalance)}
              tone={k.availableBalance !== null && Number(k.availableBalance) < 0 ? 'negative' : undefined}
              note={d.hasAccounts ? 'Saldo inicial + recebidos − pagos até hoje' : <Link to="/configuracoes" className="text-primary">Cadastre suas contas para ver o saldo</Link>} />
            <Stat label="Investimentos do mês" icon={<PiggyBank className="h-4 w-4" />} value="—" note="Módulo de investimentos: Fase 3" />
            <Stat label="Patrimônio total" value={d.declared.netWorth ? fmtBRL(d.declared.netWorth) : '—'}
              note={d.declared.netWorth ? 'Declarado no cadastro (sem cotação)' : 'Informe no perfil · consolidação na Fase 3'} />
            <Stat testId="kpi-receivables" label="A receber" icon={<CalendarClock className="h-4 w-4" />} value={fmtBRL(k.receivables)}
              tone={Number(k.receivablesOverdue) > 0 ? 'warning' : undefined}
              note={Number(k.receivablesOverdue) > 0 ? `${fmtBRL(k.receivablesOverdue)} em atraso` : 'Trabalhado e ainda não pago'} />
            <Stat testId="kpi-payables" label="A pagar" icon={<Receipt className="h-4 w-4" />} value={fmtBRL(k.payables)}
              tone={Number(k.payablesOverdue) > 0 ? 'negative' : undefined}
              note={Number(k.payablesOverdue) > 0 ? `${fmtBRL(k.payablesOverdue)} vencido` : 'Contas e faturas em aberto'} />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Horas trabalhadas" icon={<Clock className="h-4 w-4" />} value={fmtHours(k.hoursWorked)} note={`${k.shiftsDone} plantão(ões) feitos · ${k.shiftsScheduled} agendados`} />
            <Stat label="Líquido por hora" value={k.netPerHour ? fmtBRL(k.netPerHour) : '—'} note="Média dos lançamentos com horas" />
            <Stat label="Sobra do mês" value={fmtBRL(surplus)} tone={surplus >= 0 ? 'positive' : 'negative'} note="Líquido estimado − despesas (competência)" />
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Ganhos × gastos — 12 meses" subtitle="Receita líquida por competência e despesas de consumo" />
              <GroupedBars
                xKey="month"
                xFormatter={shortMonth}
                data={d.last12.map((m: any) => ({ month: m.month, net: Number(m.net), expenses: Number(m.expenses) }))}
                series={[{ key: 'net', name: 'Receita líquida', color: 'var(--series-1)' }, { key: 'expenses', name: 'Despesas', color: 'var(--series-2)' }]}
              />
            </Card>
            <Card>
              <CardHeader title="Próximos 3 meses" subtitle="Fluxo de caixa previsto (pendentes)" />
              <div className="space-y-3">
                {d.forecast.map((f: any) => (
                  <div key={f.month} className="rounded-xl bg-surface-2 p-3">
                    <p className="text-xs font-medium">{fmtMonth(f.month)}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs tabular">
                      <div><p className="text-muted">Entradas</p><p className="font-medium">{fmtBRL(f.expectedIn, { compact: true })}</p></div>
                      <div><p className="text-muted">Saídas</p><p className="font-medium">{fmtBRL(f.expectedOut, { compact: true })}</p></div>
                      <div><p className="text-muted">{d.hasAccounts ? 'Saldo fim' : 'Diferença'}</p><p className="font-medium">{fmtBRL(f.balance, { compact: true })}</p></div>
                    </div>
                  </div>
                ))}
                <p className="flex gap-1.5 text-[11px] text-muted"><Info className="h-3.5 w-3.5 shrink-0" /> Inclui plantões agendados e salários futuros — valores projetados.</p>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Receita por instituição" subtitle="Bruto no mês · líquido por hora" />
              {d.byInstitution.length ? (
                <RankBars extra rows={d.byInstitution.map((b: any) => ({ id: b.id, label: instName(b.id), value: Number(b.gross), extra: b.netPerHour ? `${fmtBRL(b.netPerHour)}/h` : null }))} />
              ) : <p className="text-sm text-muted">Sem receitas no mês.</p>}
            </Card>
            <Card>
              <CardHeader title="Receita por modalidade" subtitle="CLT, PJ, PF, cooperativa, avulso" />
              {d.byModality.length ? (
                <RankBars rows={d.byModality.map((b: any) => ({ id: b.id, label: CONTRACT_TYPE_LABEL[b.id] ?? b.id, value: Number(b.gross) }))} />
              ) : <p className="text-sm text-muted">Sem receitas no mês.</p>}
            </Card>
            <Card>
              <CardHeader title="Distribuição das despesas" subtitle="Por categoria, competência do mês" />
              {d.expensesByCategory.length ? (
                <RankBars color="var(--series-2)" rows={d.expensesByCategory.slice(0, 8).map((e: any) => ({ id: e.id, label: d.names.categories[e.id]?.name ?? 'Sem categoria', value: Number(e.amount) }))} />
              ) : <p className="text-sm text-muted">Sem despesas no mês.</p>}
            </Card>
          </div>
        </div>
      )}

      {dialog === 'shift' && <ShiftForm open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'expense' && <ExpenseForm open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'income' && <IncomeForm open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
