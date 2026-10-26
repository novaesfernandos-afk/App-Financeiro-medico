import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/useAuth';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { CONTRACT_TYPE_LABEL, SHIFT_TYPE_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { ProfileFields, profileBody } from './Settings';

const STEPS = ['Perfil', 'Contas', 'Primeiro vínculo'];

/** Assistente de cadastro inicial: tudo é opcional e editável depois em Ajustes. */
export default function Onboarding() {
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Record<string, string>>({ name: me?.name ?? '' });
  const [account, setAccount] = useState({ name: 'Conta principal', bank: '', initialBalance: '', cardName: '', closingDay: '', dueDay: '' });
  const [job, setJob] = useState({
    institution: '', type: 'PJ', title: '', taxRate: '', withheld: false, grossSalary: '', payDay: '5',
    shiftType: 'DIURNO', shiftAmount: '', payRuleDay: '10', payRuleMonths: '1',
  });

  async function next() {
    setBusy(true);
    try {
      if (step === 0) {
        await api.patch('/profile', profileBody(profile));
      } else if (step === 1) {
        if (account.initialBalance) await api.post('/accounts', { name: account.name, bank: account.bank || null, initialBalance: account.initialBalance, initialBalanceDate: todayISO() });
        if (account.cardName && account.closingDay && account.dueDay) await api.post('/cards', { name: account.cardName, closingDay: Number(account.closingDay), dueDay: Number(account.dueDay) });
      } else if (step === 2) {
        if (job.institution) {
          const inst = await api.post('/institutions', {
            name: job.institution, kind: 'HOSPITAL',
            paymentRule: { mode: 'MONTH_DAY', day: Number(job.payRuleDay), monthsAfter: Number(job.payRuleMonths) },
          });
          let taxProfileId: string | null = null;
          if (job.taxRate) {
            // Alíquota efetiva informada pelo próprio médico — marcada como estimativa
            const tp = await api.post('/tax-profiles', {
              name: `${CONTRACT_TYPE_LABEL[job.type]} — ${job.institution}`,
              scope: ['PJ', 'PF', 'CLT'].includes(job.type) ? job.type : 'OUTRO',
              version: {
                validFrom: `${todayISO().slice(0, 4)}-01-01`, confidence: 'ESTIMATED',
                components: [{ code: job.type === 'PJ' ? 'DAS' : job.type === 'CLT' ? 'IRRF' : 'OUTRO', kind: 'PERCENT', rate: job.taxRate.replace(',', '.'), withheldAtSource: job.withheld }],
                source: 'Alíquota efetiva informada no cadastro inicial',
              },
            });
            taxProfileId = tp.id;
          }
          const contract = await api.post('/contracts', {
            institutionId: inst.id, title: job.title || `${CONTRACT_TYPE_LABEL[job.type]} ${job.institution}`, type: job.type, taxProfileId,
            grossSalary: job.grossSalary || null, payDays: [Number(job.payDay) || 5], payMonthOffset: 1, startDate: todayISO(),
          });
          if (job.shiftAmount) {
            await api.post('/shift-rates', {
              institutionId: inst.id, contractId: contract.id, shiftType: job.shiftType, pricingMode: 'PER_SHIFT', amount: job.shiftAmount,
              defaultStart: job.shiftType === 'NOTURNO' ? '19:00' : '07:00', defaultEnd: job.shiftType === 'NOTURNO' ? '07:00' : '19:00',
            });
          }
        }
        await api.patch('/profile', { onboardingDone: true });
        qc.setQueryData(['me'], (m: any) => ({ ...m, onboardingDone: true }));
        await qc.invalidateQueries();
        navigate('/', { replace: true });
        return;
      }
      setStep((s) => s + 1);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="" className="h-9 w-9" />
        <div><h1 className="text-xl font-semibold">Vamos configurar seu MedFinance</h1><p className="text-sm text-muted">Tudo pode ser alterado depois. Pule o que não souber agora.</p></div>
      </div>
      <ol className="mb-6 flex gap-2" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs', i === step ? 'border-primary text-fg' : 'text-muted')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', i < step ? 'bg-accent text-white' : i === step ? 'bg-primary text-primary-fg' : 'bg-surface-2')}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <Card className="flex-1">
        {step === 0 && <ProfileFields values={profile} set={(k, v) => setProfile((s) => ({ ...s, [k]: v }))} />}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <p className="mb-3 text-sm font-medium">Conta bancária principal</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Nome" htmlFor="ob-acc"><Input id="ob-acc" value={account.name} onChange={(e) => setAccount((s) => ({ ...s, name: e.target.value }))} /></Field>
                <Field label="Banco" htmlFor="ob-bank"><Input id="ob-bank" value={account.bank} onChange={(e) => setAccount((s) => ({ ...s, bank: e.target.value }))} /></Field>
                <Field label="Saldo hoje" htmlFor="ob-bal" hint="Base do saldo disponível"><MoneyInput id="ob-bal" value={account.initialBalance} onChange={(v) => setAccount((s) => ({ ...s, initialBalance: v }))} /></Field>
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-medium">Cartão de crédito (opcional)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Nome do cartão" htmlFor="ob-card"><Input id="ob-card" value={account.cardName} onChange={(e) => setAccount((s) => ({ ...s, cardName: e.target.value }))} /></Field>
                <Field label="Dia de fechamento" htmlFor="ob-close"><Input id="ob-close" type="number" min={1} max={31} value={account.closingDay} onChange={(e) => setAccount((s) => ({ ...s, closingDay: e.target.value }))} /></Field>
                <Field label="Dia de vencimento" htmlFor="ob-due"><Input id="ob-due" type="number" min={1} max={31} value={account.dueDay} onChange={(e) => setAccount((s) => ({ ...s, dueDay: e.target.value }))} /></Field>
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Cadastre onde você trabalha. Outros vínculos podem ser adicionados em Receitas → Vínculos.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Instituição" htmlFor="ob-inst"><Input id="ob-inst" placeholder="Hospital, clínica…" value={job.institution} onChange={(e) => setJob((s) => ({ ...s, institution: e.target.value }))} /></Field>
              <Field label="Tipo de vínculo" htmlFor="ob-type">
                <Select id="ob-type" value={job.type} onChange={(e) => setJob((s) => ({ ...s, type: e.target.value }))}>
                  {['CLT', 'PJ', 'PF', 'COOPERATIVA', 'OUTRO'].map((t) => <option key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</option>)}
                </Select>
              </Field>
              <Field label="Alíquota efetiva de imposto (%)" htmlFor="ob-tax" hint="A que você realmente paga nesta fonte (pergunte ao contador). Vazio = não configurado.">
                <Input id="ob-tax" inputMode="decimal" value={job.taxRate} onChange={(e) => setJob((s) => ({ ...s, taxRate: e.target.value }))} />
              </Field>
              <Field label="O imposto é retido na fonte?" htmlFor="ob-wh">
                <Select id="ob-wh" value={job.withheld ? 'y' : 'n'} onChange={(e) => setJob((s) => ({ ...s, withheld: e.target.value === 'y' }))}><option value="n">Não</option><option value="y">Sim</option></Select>
              </Field>
              <Field label="Salário/fixo mensal bruto (se houver)" htmlFor="ob-sal"><MoneyInput id="ob-sal" value={job.grossSalary} onChange={(v) => setJob((s) => ({ ...s, grossSalary: v }))} /></Field>
              <Field label="Dia do pagamento do fixo" htmlFor="ob-pd"><Input id="ob-pd" type="number" min={1} max={31} value={job.payDay} onChange={(e) => setJob((s) => ({ ...s, payDay: e.target.value }))} /></Field>
              <Field label="Valor padrão do plantão (se houver)" htmlFor="ob-sa"><MoneyInput id="ob-sa" value={job.shiftAmount} onChange={(v) => setJob((s) => ({ ...s, shiftAmount: v }))} /></Field>
              <Field label="Tipo de plantão padrão" htmlFor="ob-st">
                <Select id="ob-st" value={job.shiftType} onChange={(e) => setJob((s) => ({ ...s, shiftType: e.target.value }))}>{Object.entries(SHIFT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Field>
              <Field label="Plantões são pagos no dia" htmlFor="ob-prd"><Input id="ob-prd" type="number" min={1} max={31} value={job.payRuleDay} onChange={(e) => setJob((s) => ({ ...s, payRuleDay: e.target.value }))} /></Field>
              <Field label="…quantos meses após o plantão" htmlFor="ob-prm"><Input id="ob-prm" type="number" min={0} max={6} value={job.payRuleMonths} onChange={(e) => setJob((s) => ({ ...s, payRuleMonths: e.target.value }))} /></Field>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>Voltar</Button>
        <Button onClick={next} loading={busy} data-testid="onboarding-next">{step === STEPS.length - 1 ? 'Concluir' : 'Continuar'}</Button>
      </div>
    </div>
  );
}
