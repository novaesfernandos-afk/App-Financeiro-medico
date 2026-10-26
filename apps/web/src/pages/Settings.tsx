import { Download, KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InstitutionForm } from '@/components/forms/InstitutionForm';
import { SimpleCrud } from '@/components/SimpleCrud';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { Badge, PageHeader, Segmented } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { useTheme, type Theme } from '@/hooks/useTheme';
import { api, errorMessage } from '@/lib/api';
import { fmtBRL, fmtDate, todayISO } from '@/lib/format';
import { INSTITUTION_KIND_LABEL, SHIFT_TYPE_LABEL, TAX_REGIME_LABEL, WEEKDAYS } from '@/lib/labels';
import { useApiMutation, useCategories, useContracts, useInstitutions, useList } from '@/lib/queries';

type Tab = 'perfil' | 'instituicoes' | 'financeiro' | 'categorias' | 'seguranca';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('perfil');
  return (
    <div>
      <PageHeader title="Ajustes" subtitle="Perfil, instituições, contas, cartões, categorias, segurança e privacidade." />
      <div className="mb-5 overflow-x-auto">
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: 'perfil', label: 'Perfil' },
          { value: 'instituicoes', label: 'Instituições' },
          { value: 'financeiro', label: 'Contas e cartões' },
          { value: 'categorias', label: 'Categorias' },
          { value: 'seguranca', label: 'Segurança e LGPD' },
        ]} />
      </div>
      {tab === 'perfil' && <ProfileTab />}
      {tab === 'instituicoes' && <InstitutionsTab />}
      {tab === 'financeiro' && <FinanceTab />}
      {tab === 'categorias' && <CategoriesTab />}
      {tab === 'seguranca' && <SecurityTab />}
    </div>
  );
}

export function ProfileFields({ values, set }: { values: Record<string, string>; set: (k: string, v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome" htmlFor="p-name"><Input id="p-name" required value={values.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Especialidade" htmlFor="p-spec"><Input id="p-spec" value={values.specialty ?? ''} onChange={(e) => set('specialty', e.target.value)} placeholder="Ex.: Anestesiologia" /></Field>
      <Field label="CRM (opcional)" htmlFor="p-crm"><Input id="p-crm" value={values.crm ?? ''} onChange={(e) => set('crm', e.target.value)} placeholder="000000/UF" /></Field>
      <Field label="Renda mensal estimada" htmlFor="p-inc" hint="Referência de planejamento — não entra nos cálculos reais"><MoneyInput id="p-inc" value={values.estimatedMonthlyIncome ?? ''} onChange={(v) => set('estimatedMonthlyIncome', v)} /></Field>
      <Field label="Reserva de emergência desejada" htmlFor="p-res"><MoneyInput id="p-res" value={values.emergencyReserveTarget ?? ''} onChange={(v) => set('emergencyReserveTarget', v)} /></Field>
      <Field label="Patrimônio total declarado" htmlFor="p-nw" hint="Imóveis, veículos, aplicações etc. (até o módulo de patrimônio)"><MoneyInput id="p-nw" value={values.declaredNetWorth ?? ''} onChange={(v) => set('declaredNetWorth', v)} /></Field>
      <Field label="Investimentos existentes (total)" htmlFor="p-inv"><MoneyInput id="p-inv" value={values.declaredInvestments ?? ''} onChange={(v) => set('declaredInvestments', v)} /></Field>
    </div>
  );
}

export const PROFILE_KEYS = ['name', 'specialty', 'crm', 'estimatedMonthlyIncome', 'emergencyReserveTarget', 'declaredNetWorth', 'declaredInvestments'] as const;
export const profileBody = (v: Record<string, string>) =>
  Object.fromEntries(PROFILE_KEYS.map((k) => [k, k === 'name' ? v[k] : v[k] ? v[k] : null]));

function ProfileTab() {
  const toast = useToast();
  const profile = useList<any>(['profile'], '/profile');
  const { theme, setTheme } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (profile.data) setValues(Object.fromEntries(PROFILE_KEYS.map((k) => [k, profile.data[k] ?? ''])));
  }, [profile.data]);
  const save = useApiMutation(() => api.patch('/profile', profileBody(values)));
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader title="Dados profissionais e financeiros" />
        <form onSubmit={async (e) => { e.preventDefault(); try { await save.mutateAsync(undefined); toast('Perfil atualizado'); } catch (err) { toast(errorMessage(err), 'error'); } }} className="space-y-4">
          <ProfileFields values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
          <Button type="submit" loading={save.isPending}>Salvar</Button>
        </form>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Aparência" />
          <Select aria-label="Tema" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Seguir o sistema</option>
          </Select>
        </Card>
        <SimpleCrud title="Empresas (PJ)" endpoint="/companies" emptyText="Nenhuma empresa médica cadastrada."
          fields={[
            { name: 'name', label: 'Razão social / nome', type: 'text', required: true },
            { name: 'cnpj', label: 'CNPJ', type: 'text', placeholder: '00.000.000/0000-00' },
            { name: 'taxRegime', label: 'Regime tributário', type: 'select', required: true, options: Object.entries(TAX_REGIME_LABEL).map(([value, label]) => ({ value, label })) },
            { name: 'accountingFee', label: 'Honorários contábeis (mensal)', type: 'money' },
          ]}
          defaults={{ taxRegime: 'NAO_INFORMADO' }}
          render={(c) => <><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{TAX_REGIME_LABEL[c.taxRegime]}{c.cnpj ? ` · ${c.cnpj}` : ''}</p></>} />
      </div>
    </div>
  );
}

function InstitutionsTab() {
  const toast = useToast();
  const institutions = useInstitutions();
  const contracts = useContracts();
  const rates = useList<any[]>(['shift-rates'], '/shift-rates');
  const [editing, setEditing] = useState<any>(null);
  const [rateFor, setRateFor] = useState<any>(null);
  const delInst = useApiMutation((id: string) => api.del(`/institutions/${id}`));
  const delRate = useApiMutation((id: string) => api.del(`/shift-rates/${id}`));
  const ruleText = (r: any) => !r ? 'Data de pagamento manual' : r.mode === 'DAYS_AFTER' ? `Paga ${r.days} dias após o plantão` : `Paga no dia ${r.day}, ${r.monthsAfter === 0 ? 'no mesmo mês' : `${r.monthsAfter} mês(es) depois`}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Instituição</Button></div>
      {institutions.data?.length === 0 && <p className="text-sm text-muted">Nenhuma instituição cadastrada.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {institutions.data?.map((i) => {
          const instRates = rates.data?.filter((r) => r.institutionId === i.id) ?? [];
          return (
            <Card key={i.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: i.color }} />
                  <div><p className="font-medium">{i.name}</p><p className="text-xs text-muted">{INSTITUTION_KIND_LABEL[i.kind]} · {ruleText(i.paymentRule)}</p></div>
                </div>
                <div className="flex">
                  <Button size="icon" variant="ghost" aria-label="Editar instituição" onClick={() => setEditing(i)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Arquivar instituição" onClick={async () => { try { await delInst.mutateAsync(i.id); toast('Instituição arquivada'); } catch (e) { toast(errorMessage(e), 'error'); } }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">Tabela de valores de plantão</p>
                  <Button size="sm" variant="ghost" onClick={() => setRateFor(i)}><Plus className="h-3.5 w-3.5" /> Valor</Button>
                </div>
                {instRates.length === 0 ? <p className="text-xs text-muted">Sem valores padrão — informe o valor em cada plantão.</p> : (
                  <ul className="space-y-1.5">
                    {instRates.map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
                        <span>{SHIFT_TYPE_LABEL[r.shiftType]}{r.weekday !== null ? ` · ${WEEKDAYS[r.weekday]}` : ''} · {r.defaultStart}–{r.defaultEnd}
                          {r.contractId && <span className="text-muted"> · {contracts.data?.find((c) => c.id === r.contractId)?.title}</span>}</span>
                        <span className="flex items-center gap-1 tabular font-medium">
                          {fmtBRL(r.amount)}{r.pricingMode === 'PER_HOUR' ? '/h' : ''}{r.additionalPercent ? ` +${Number(r.additionalPercent)}%` : ''}
                          <button aria-label="Remover valor" className="ml-1 rounded p-1 text-muted hover:text-negative" onClick={async () => { try { await delRate.mutateAsync(r.id); } catch (e) { toast(errorMessage(e), 'error'); } }}><Trash2 className="h-3 w-3" /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {editing && <InstitutionForm open institution={editing.id ? editing : undefined} onOpenChange={(o) => !o && setEditing(null)} />}
      {rateFor && <RateDialog institution={rateFor} onClose={() => setRateFor(null)} />}
    </div>
  );
}

function RateDialog({ institution, onClose }: { institution: any; onClose: () => void }) {
  const toast = useToast();
  const contracts = useContracts();
  const [v, setV] = useState({ shiftType: 'DIURNO', weekday: '', pricingMode: 'PER_SHIFT', amount: '', additionalPercent: '', defaultStart: '07:00', defaultEnd: '19:00', contractId: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useApiMutation(() => api.post('/shift-rates', {
    institutionId: institution.id, contractId: v.contractId || null, shiftType: v.shiftType, weekday: v.weekday === '' ? null : Number(v.weekday),
    pricingMode: v.pricingMode, amount: v.amount, additionalPercent: v.additionalPercent || null, defaultStart: v.defaultStart, defaultEnd: v.defaultEnd,
  }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Valor de plantão — ${institution.name}`} description="Usado automaticamente ao registrar plantões. Regra de dia da semana tem prioridade."
      footer={<Button form="rate-form" type="submit" loading={save.isPending}>Salvar</Button>}>
      <form id="rate-form" className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); try { await save.mutateAsync(undefined); toast('Valor salvo'); onClose(); } catch (err) { toast(errorMessage(err), 'error'); } }}>
        <Field label="Tipo de plantão" htmlFor="r-type"><Select id="r-type" value={v.shiftType} onChange={set('shiftType')}>{Object.entries(SHIFT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Dia da semana" htmlFor="r-wd"><Select id="r-wd" value={v.weekday} onChange={set('weekday')}><option value="">Qualquer dia</option>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
        <Field label="Cobrança" htmlFor="r-pm"><Select id="r-pm" value={v.pricingMode} onChange={set('pricingMode')}><option value="PER_SHIFT">Por plantão</option><option value="PER_HOUR">Por hora</option></Select></Field>
        <Field label="Valor bruto" htmlFor="r-amount"><MoneyInput id="r-amount" required value={v.amount} onChange={(x) => setV((s) => ({ ...s, amount: x }))} /></Field>
        <Field label="Início padrão" htmlFor="r-st"><Input id="r-st" type="time" value={v.defaultStart} onChange={set('defaultStart')} /></Field>
        <Field label="Término padrão" htmlFor="r-et"><Input id="r-et" type="time" value={v.defaultEnd} onChange={set('defaultEnd')} /></Field>
        <Field label="Adicional (%)" htmlFor="r-add"><Input id="r-add" inputMode="decimal" value={v.additionalPercent} onChange={set('additionalPercent')} /></Field>
        <Field label="Apenas para o vínculo" htmlFor="r-c"><Select id="r-c" value={v.contractId} onChange={set('contractId')}><option value="">Todos</option>{contracts.data?.filter((c) => c.institutionId === institution.id).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
      </form>
    </Dialog>
  );
}

function FinanceTab() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SimpleCrud title="Contas bancárias" subtitle="O saldo inicial + data de referência são a base do saldo disponível." endpoint="/accounts" emptyText="Nenhuma conta cadastrada."
        defaults={{ kind: 'CORRENTE', initialBalanceDate: todayISO() }}
        fields={[
          { name: 'name', label: 'Nome', type: 'text', required: true, placeholder: 'Conta PF, Conta PJ…' },
          { name: 'bank', label: 'Banco', type: 'text' },
          { name: 'kind', label: 'Tipo', type: 'select', required: true, options: [{ value: 'CORRENTE', label: 'Corrente' }, { value: 'POUPANCA', label: 'Poupança' }, { value: 'PAGAMENTO', label: 'Conta de pagamento' }, { value: 'INVESTIMENTO', label: 'Investimento' }, { value: 'OUTRA', label: 'Outra' }] },
          { name: 'initialBalance', label: 'Saldo na data de referência', type: 'money', required: true },
          { name: 'initialBalanceDate', label: 'Data de referência', type: 'date', required: true, hint: 'Saldo no início do dia; lançamentos a partir desta data alteram o saldo' },
        ]}
        render={(a) => <><p className="font-medium">{a.name}</p><p className="text-xs text-muted">{a.bank ?? '—'} · {fmtBRL(a.initialBalance)} em {fmtDate(a.initialBalanceDate)}</p></>} />
      <SimpleCrud title="Cartões de crédito" endpoint="/cards" emptyText="Nenhum cartão cadastrado."
        fields={[
          { name: 'name', label: 'Nome', type: 'text', required: true },
          { name: 'brand', label: 'Bandeira', type: 'text' },
          { name: 'closingDay', label: 'Dia de fechamento', type: 'number', required: true },
          { name: 'dueDay', label: 'Dia de vencimento', type: 'number', required: true },
          { name: 'limit', label: 'Limite', type: 'money' },
        ]}
        render={(c) => <><p className="font-medium">{c.name}</p><p className="text-xs text-muted">Fecha dia {c.closingDay} · vence dia {c.dueDay}{c.limit ? ` · limite ${fmtBRL(c.limit)}` : ''}</p></>} />
      <SimpleCrud title="Metas financeiras" endpoint="/goals" emptyText="Nenhuma meta cadastrada."
        defaults={{ kind: 'RESERVA_EMERGENCIA' }}
        fields={[
          { name: 'name', label: 'Nome', type: 'text', required: true },
          { name: 'kind', label: 'Tipo', type: 'select', required: true, options: [{ value: 'RESERVA_EMERGENCIA', label: 'Reserva de emergência' }, { value: 'PATRIMONIO', label: 'Patrimônio' }, { value: 'APOSENTADORIA', label: 'Aposentadoria' }, { value: 'COMPRA', label: 'Compra' }, { value: 'OUTRA', label: 'Outra' }] },
          { name: 'targetAmount', label: 'Valor alvo', type: 'money', required: true },
          { name: 'currentAmount', label: 'Já acumulado', type: 'money' },
          { name: 'targetDate', label: 'Prazo', type: 'date' },
        ]}
        render={(g) => {
          const pct = Math.min(100, (Number(g.currentAmount) / Number(g.targetAmount)) * 100 || 0);
          return (
            <>
              <p className="font-medium">{g.name}</p>
              <p className="text-xs text-muted">{fmtBRL(g.currentAmount)} de {fmtBRL(g.targetAmount)}{g.targetDate ? ` até ${fmtDate(g.targetDate)}` : ''}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
            </>
          );
        }} />
    </div>
  );
}

function CategoriesTab() {
  return (
    <SimpleCrud title="Categorias de despesa" subtitle="Defina orçamentos mensais para acompanhar estouros." endpoint="/expense-categories" emptyText="Sem categorias."
      defaults={{ scope: 'PESSOAL', color: '#64748b' }}
      fields={[
        { name: 'name', label: 'Nome', type: 'text', required: true },
        { name: 'scope', label: 'Âmbito', type: 'select', required: true, options: [{ value: 'PESSOAL', label: 'Pessoal' }, { value: 'PROFISSIONAL', label: 'Profissional' }] },
        { name: 'monthlyBudget', label: 'Orçamento mensal', type: 'money' },
        { name: 'color', label: 'Cor (hex)', type: 'text', placeholder: '#0e7490' },
      ]}
      render={(c) => (
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
          {c.name}
          <Badge>{c.scope === 'PESSOAL' ? 'Pessoal' : 'Profissional'}</Badge>
          {c.isTax && <Badge tone="negative">Tributos</Badge>}
          {c.monthlyBudget && <span className="text-xs text-muted">orçamento {fmtBRL(c.monthlyBudget)}</span>}
        </span>
      )} />
  );
}

function SecurityTab() {
  const toast = useToast();
  const { me, refresh, logout } = useAuth();
  const audit = useList<any[]>(['audit'], '/audit?take=30');
  const [mfa, setMfa] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState({ open: false, password: '', code: '' });
  const [del, setDel] = useState({ open: false, password: '', confirmation: '' });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); return true; } catch (e) { toast(errorMessage(e), 'error'); return false; }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Autenticação em dois fatores (MFA)" subtitle="Use Google Authenticator, 1Password, Authy…" action={me?.mfaEnabled ? <Badge tone="positive"><ShieldCheck className="h-3 w-3" /> Ativo</Badge> : <Badge tone="warning">Inativo</Badge>} />
        {me?.mfaEnabled ? (
          <Button variant="outline" onClick={() => setDisable((s) => ({ ...s, open: true }))}>Desativar MFA</Button>
        ) : mfa ? (
          <div className="space-y-3 text-sm">
            <p>Adicione a conta no seu aplicativo autenticador usando a chave abaixo (ou abra o link no celular) e informe o código gerado.</p>
            <code className="block break-all rounded-xl bg-surface-2 p-3 font-mono text-xs">{mfa.secret}</code>
            <a className="text-xs text-primary underline" href={mfa.otpauthUrl}>Abrir no app autenticador</a>
            <div className="flex gap-2">
              <Input aria-label="Código de 6 dígitos" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" />
              <Button onClick={() => run(async () => { await api.post('/auth/mfa/enable', { code }); setMfa(null); await refresh(); }, 'MFA ativado')}>Ativar</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => run(async () => setMfa(await api.post('/auth/mfa/setup')), 'Chave gerada')}><KeyRound className="h-4 w-4" /> Configurar MFA</Button>
        )}
      </Card>

      <Card>
        <CardHeader title="Alterar senha" />
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api.post('/auth/password', pwd), 'Senha alterada')) setPwd({ currentPassword: '', newPassword: '' }); }}>
          <Field label="Senha atual" htmlFor="pw-c"><Input id="pw-c" type="password" autoComplete="current-password" required value={pwd.currentPassword} onChange={(e) => setPwd((s) => ({ ...s, currentPassword: e.target.value }))} /></Field>
          <Field label="Nova senha" htmlFor="pw-n" hint="Mínimo 10 caracteres, com letras e números"><Input id="pw-n" type="password" autoComplete="new-password" required value={pwd.newPassword} onChange={(e) => setPwd((s) => ({ ...s, newPassword: e.target.value }))} /></Field>
          <Button type="submit" variant="secondary">Alterar senha</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Privacidade (LGPD)" subtitle="Seus dados são seus: exporte ou exclua a qualquer momento." />
        <div className="flex flex-wrap gap-2">
          <a href="/api/privacy/export" download><Button variant="outline"><Download className="h-4 w-4" /> Exportar meus dados (JSON)</Button></a>
          <Button variant="danger" onClick={() => setDel((s) => ({ ...s, open: true }))}><Trash2 className="h-4 w-4" /> Excluir conta</Button>
        </div>
        <p className="mt-3 text-xs text-muted">Nenhum dado financeiro é enviado a serviços externos sem seu consentimento explícito.</p>
      </Card>

      <Card>
        <CardHeader title="Atividade recente" subtitle="Trilha de auditoria das operações" />
        <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
          {audit.data?.map((a) => (
            <li key={a.id} className="flex justify-between gap-2 border-b py-1.5 last:border-0">
              <span><b className="font-medium">{a.action}</b> {a.entity}</span>
              <span className="text-muted">{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={disable.open} onOpenChange={(o) => setDisable((s) => ({ ...s, open: o }))} title="Desativar MFA"
        footer={<Button variant="danger" onClick={async () => { if (await run(() => api.post('/auth/mfa/disable', { password: disable.password, code: disable.code }), 'MFA desativado')) { setDisable({ open: false, password: '', code: '' }); await refresh(); } }}>Desativar</Button>}>
        <div className="space-y-3">
          <Field label="Senha" htmlFor="d-pw"><Input id="d-pw" type="password" value={disable.password} onChange={(e) => setDisable((s) => ({ ...s, password: e.target.value }))} /></Field>
          <Field label="Código MFA" htmlFor="d-code"><Input id="d-code" inputMode="numeric" maxLength={6} value={disable.code} onChange={(e) => setDisable((s) => ({ ...s, code: e.target.value }))} /></Field>
        </div>
      </Dialog>
      <Dialog open={del.open} onOpenChange={(o) => setDel((s) => ({ ...s, open: o }))} title="Excluir conta definitivamente"
        description="Todos os seus dados serão apagados de forma irreversível. Exporte antes se quiser guardar uma cópia."
        footer={<Button variant="danger" disabled={del.confirmation !== 'EXCLUIR MINHA CONTA'} onClick={async () => { if (await run(() => api.post('/privacy/delete-account', { password: del.password, confirmation: del.confirmation }), 'Conta excluída')) await logout(); }}>Excluir tudo</Button>}>
        <div className="space-y-3">
          <Field label="Senha" htmlFor="x-pw"><Input id="x-pw" type="password" value={del.password} onChange={(e) => setDel((s) => ({ ...s, password: e.target.value }))} /></Field>
          <Field label='Digite "EXCLUIR MINHA CONTA"' htmlFor="x-c"><Input id="x-c" value={del.confirmation} onChange={(e) => setDel((s) => ({ ...s, confirmation: e.target.value }))} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
