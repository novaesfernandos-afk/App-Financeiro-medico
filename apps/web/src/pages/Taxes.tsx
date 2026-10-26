import { Calculator, History, Landmark, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TaxProfileForm } from '@/components/forms/TaxProfileForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui/misc';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { fmtBRL, fmtDate, todayISO } from '@/lib/format';
import { CONTRACT_TYPE_LABEL, TAX_STATUS_LABEL } from '@/lib/labels';
import { useApiMutation, useList, useTaxProfiles } from '@/lib/queries';

const describe = (c: any) => `${c.code} ${c.kind === 'PERCENT' ? `${c.rate}%` : c.kind === 'FIXED' ? fmtBRL(c.amount) : 'tabela'}${c.withheldAtSource ? ' (retido)' : ''}`;

export default function Taxes() {
  const toast = useToast();
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)));
  const profiles = useTaxProfiles();
  const summary = useList<any>(['tax-summary', year], `/tax/summary?year=${year}`);
  const [creating, setCreating] = useState(false);
  const [versionFor, setVersionFor] = useState<any>(null);
  const delVersion = useApiMutation(({ p, v }: { p: string; v: string }) => api.del(`/tax-profiles/${p}/versions/${v}`));
  const s = summary.data;

  return (
    <div>
      <PageHeader title="Impostos PF/PJ" subtitle="Regras por vínculo, versionadas por vigência, com fonte. Estimativas são separadas de valores confirmados."
        actions={<>
          <Select aria-label="Ano" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, 1, 2, 3].map((k) => { const y = Number(todayISO().slice(0, 4)) - k; return <option key={y} value={y}>{y}</option>; })}
          </Select>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Perfil tributário</Button>
        </>} />

      {!s ? <PageLoader /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Receita bruta no ano" value={fmtBRL(s.totals.gross)} />
            <Stat label="Impostos provisionados" value={fmtBRL(s.totals.taxProvisioned)} note={`Confirmados: ${fmtBRL(s.totals.taxConfirmed)}`} />
            <Stat label="Retido na fonte" value={fmtBRL(s.totals.taxWithheld)} />
            <Stat label="Guias pagas (DAS, ISS…)" value={fmtBRL(s.totals.taxPaidAsExpense)} note="Despesas na categoria Tributos" />
            <Stat label="Guias a pagar" value={fmtBRL(s.totals.taxPendingAsExpense)} tone={Number(s.totals.taxPendingAsExpense) > 0 ? 'warning' : undefined} />
          </div>

          <Card className="mb-5">
            <CardHeader title="Carga tributária por fonte de renda" subtitle="Compare quanto cada instituição/modalidade deixa de imposto" />
            {s.bySource.length === 0 ? <p className="text-sm text-muted">Sem receitas no ano.</p> : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr><th className="px-4 py-2 font-medium">Fonte</th><th className="px-2 py-2 font-medium">Modalidade</th><th className="px-2 py-2 text-right font-medium">Bruto</th><th className="px-2 py-2 text-right font-medium">Imposto</th><th className="px-2 py-2 text-right font-medium">Alíquota efetiva</th><th className="px-4 py-2 font-medium">Natureza</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {s.bySource.map((r: any) => (
                      <tr key={`${r.institutionId}-${r.modality}`}>
                        <td className="px-4 py-2.5">{s.names.institutions[r.institutionId]?.name ?? 'Avulso'}</td>
                        <td className="px-2 py-2.5">{CONTRACT_TYPE_LABEL[r.modality] ?? r.modality}</td>
                        <td className="px-2 py-2.5 text-right tabular">{fmtBRL(r.gross)}</td>
                        <td className="px-2 py-2.5 text-right tabular">{fmtBRL(r.tax)}</td>
                        <td className="px-2 py-2.5 text-right font-medium tabular">{r.effectiveRate}%</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {r.confirmed > 0 && <Badge tone="positive">{r.confirmed} confirm.</Badge>}
                            {r.estimated > 0 && <Badge tone="info">{r.estimated} estim.</Badge>}
                            {r.notConfigured > 0 && <Badge tone="warning">{r.notConfigured} sem regra</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Perfis tributários</h2>
          {profiles.isLoading ? <PageLoader /> : !profiles.data?.length ? (
            <EmptyState icon={<Landmark className="h-8 w-8" />} title="Nenhum perfil tributário"
              description="Crie um perfil para cada realidade tributária (ex.: PJ Simples do hospital A, CLT do hospital B, autônomo com ISS fixo) e associe aos vínculos."
              action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Criar perfil</Button>} />
          ) : profiles.data.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{p.scope}{p.company ? ` · ${p.company.name}` : ''}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setVersionFor(p)}><History className="h-3.5 w-3.5" /> Nova vigência</Button>
              </div>
              <ol className="mt-3 space-y-2">
                {p.versions.map((v: any) => (
                  <li key={v.id} className="rounded-xl bg-surface-2 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{fmtDate(v.validFrom)} → {v.validTo ? fmtDate(v.validTo) : 'vigente'}</span>
                      <span className="flex items-center gap-1">
                        <Badge tone={v.confidence === 'CONFIRMED' ? 'positive' : 'info'}>{TAX_STATUS_LABEL[v.confidence]}</Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Excluir vigência"
                          onClick={async () => { try { await delVersion.mutateAsync({ p: p.id, v: v.id }); toast('Vigência excluída'); } catch (e) { toast(errorMessage(e), 'error'); } }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    </div>
                    <p className="mt-1 tabular">{v.components.length ? v.components.map(describe).join(' + ') : 'Sem tributos'}</p>
                    {(v.legalReference || v.source) && <p className="mt-1 text-muted">{[v.legalReference, v.source].filter(Boolean).join(' · ')}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
        <div className="space-y-5">
          <Simulator profiles={profiles.data ?? []} />
          {s && s.upcomingObligations.length > 0 && (
            <Card>
              <CardHeader title="Obrigações fiscais pendentes" subtitle="Guias lançadas como despesa (categoria Tributos)" />
              <ul className="space-y-2 text-sm">
                {s.upcomingObligations.map((o: any) => (
                  <li key={o.key} className="flex justify-between gap-2"><span>{o.title} <span className="text-xs text-muted">{fmtDate(o.cashDate)}</span></span><span className="tabular">{fmtBRL(o.net)}</span></li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="text-xs text-muted">
            <p className="mb-1 font-medium text-fg">Como o MedFinance trata impostos</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Nenhuma alíquota é aplicada automaticamente: sem perfil, o imposto fica como "não configurado".</li>
              <li>O imposto de cada lançamento usa a vigência ativa na data de competência.</li>
              <li>Distribuição de lucros e pró-labore são registrados na PF sem novo imposto da PJ, evitando dupla contagem com o faturamento.</li>
              <li>Guias (DAS, ISS, Carnê-Leão) pagas entram como despesas da categoria Tributos.</li>
            </ul>
          </Card>
        </div>
      </div>

      {creating && <TaxProfileForm open onOpenChange={setCreating} />}
      {versionFor && <TaxProfileForm open profile={versionFor} onOpenChange={(o) => !o && setVersionFor(null)} />}
    </div>
  );
}

function Simulator({ profiles }: { profiles: any[] }) {
  const [gross, setGross] = useState('10000');
  const [date, setDate] = useState(todayISO());
  const [profileId, setProfileId] = useState('');
  const sim = useApiMutation(() => api.post('/tax/simulate', { gross, date, taxProfileId: profileId || undefined }));
  return (
    <Card>
      <CardHeader title="Simulador" subtitle="Quanto sobra de um valor bruto em cada regra" />
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); sim.mutate(undefined); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor bruto" htmlFor="sim-g"><MoneyInput id="sim-g" value={gross} onChange={setGross} /></Field>
          <Field label="Competência" htmlFor="sim-d"><Input id="sim-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Perfil" htmlFor="sim-p">
          <Select id="sim-p" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Selecione…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" className="w-full" loading={sim.isPending} disabled={!profileId}><Calculator className="h-4 w-4" /> Simular</Button>
      </form>
      {sim.data && (
        <div className="mt-4 space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
          {sim.data.items.map((i: any, k: number) => <p key={k} className="flex justify-between"><span className="text-muted">{i.label}</span><span className="tabular">{fmtBRL(i.amount)}</span></p>)}
          <p className="flex justify-between border-t pt-1 font-medium"><span>Imposto ({sim.data.effectiveRate}%)</span><span className="tabular">{fmtBRL(sim.data.total)}</span></p>
          <p className="flex justify-between font-semibold text-positive"><span>Líquido</span><span className="tabular">{fmtBRL(Number(sim.data.gross) - Number(sim.data.total))}</span></p>
          <p className="text-[11px] text-muted">{sim.data.status === 'NOT_CONFIGURED' ? 'Sem vigência para a data.' : TAX_STATUS_LABEL[sim.data.status]}{sim.data.legalReference ? ` · ${sim.data.legalReference}` : ''}</p>
        </div>
      )}
    </Card>
  );
}
