import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { useApiMutation, useCards, useCategories } from '@/lib/queries';
import { nn, undef, useFormState } from './useFormState';

export function ExpenseForm({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: any }) {
  const toast = useToast();
  const categories = useCategories();
  const cards = useCards();
  const f = useFormState({
    description: expense?.description ?? '', amount: expense?.amount ?? '', categoryId: expense?.categoryId ?? '',
    competenceDate: expense?.competenceDate ?? todayISO(), dueDate: expense?.dueDate ?? '', paymentMethod: expense?.paymentMethod ?? 'PIX',
    creditCardId: expense?.creditCardId ?? '', paid: expense ? expense.status === 'PAGO' : false, paidDate: expense?.paidDate ?? '',
    mode: 'single', installments: '2', repeatMonths: '12', costCenter: expense?.costCenter ?? '', applyToGroup: false,
  });
  const v = f.values;
  const onCard = v.paymentMethod === 'CARTAO_CREDITO';
  const grouped = Boolean(expense?.installmentGroupId || expense?.recurringGroupId);

  const save = useApiMutation(async () => {
    const base = {
      description: v.description, amount: v.amount, categoryId: nn(v.categoryId), competenceDate: v.competenceDate,
      dueDate: undef(v.dueDate), paymentMethod: v.paymentMethod, creditCardId: onCard ? nn(v.creditCardId) : null,
      costCenter: nn(v.costCenter),
    };
    if (expense) {
      return api.patch(`/expenses/${expense.id}`, {
        ...base, status: onCard ? undefined : v.paid ? 'PAGO' : 'PENDENTE', paidDate: v.paid ? undef(v.paidDate) : null, applyToGroup: v.applyToGroup || undefined,
      });
    }
    return api.post('/expenses', {
      ...base,
      status: !onCard && v.paid ? 'PAGO' : undefined, paidDate: !onCard && v.paid ? undef(v.paidDate) ?? v.competenceDate : undefined,
      installments: v.mode === 'installments' ? Number(v.installments) : undefined,
      repeatMonths: v.mode === 'repeat' ? Number(v.repeatMonths) : undefined,
    });
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { await save.mutateAsync(undefined); toast('Despesa salva'); onOpenChange(false); } catch (err) { toast(errorMessage(err), 'error'); }
  }

  const pessoais = categories.data?.filter((c) => c.scope === 'PESSOAL') ?? [];
  const profissionais = categories.data?.filter((c) => c.scope === 'PROFISSIONAL') ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={expense ? 'Editar despesa' : 'Nova despesa'}
      footer={<Button form="expense-form" type="submit" loading={save.isPending}>Salvar</Button>}>
      <form id="expense-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" htmlFor="e-desc" className="sm:col-span-2"><Input id="e-desc" required {...f.bind('description')} /></Field>
        <Field label={v.mode === 'installments' ? 'Valor TOTAL da compra' : 'Valor'} htmlFor="e-amount"><MoneyInput id="e-amount" required value={v.amount} onChange={f.set('amount')} /></Field>
        <Field label="Categoria" htmlFor="e-cat">
          <Select id="e-cat" {...f.bind('categoryId')}>
            <option value="">Sem categoria</option>
            <optgroup label="Pessoais">{pessoais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Profissionais">{profissionais.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </Select>
        </Field>
        <Field label="Forma de pagamento" htmlFor="e-pm">
          <Select id="e-pm" {...f.bind('paymentMethod')}>{Object.entries(PAYMENT_METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        {onCard ? (
          <Field label="Cartão" htmlFor="e-card" hint={(cards.data?.length ?? 0) === 0 ? 'Cadastre um cartão em Ajustes.' : 'Entra na fatura correspondente — o pagamento da fatura não conta de novo.'}>
            <Select id="e-card" required {...f.bind('creditCardId')}>
              <option value="">Selecione…</option>
              {cards.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Vencimento" htmlFor="e-due"><Input id="e-due" type="date" {...f.bind('dueDate')} /></Field>
        )}
        <Field label={onCard ? 'Data da compra' : 'Competência (data da despesa)'} htmlFor="e-comp"><Input id="e-comp" type="date" required {...f.bind('competenceDate')} /></Field>
        <Field label="Centro de custo (opcional)" htmlFor="e-cc"><Input id="e-cc" placeholder="Consultório, PJ, família…" {...f.bind('costCenter')} /></Field>

        {!expense && (
          <Field label="Recorrência" htmlFor="e-mode" className="sm:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select id="e-mode" {...f.bind('mode')}>
                <option value="single">Lançamento único</option>
                <option value="installments">Parcelado</option>
                <option value="repeat">Conta fixa mensal</option>
              </Select>
              {v.mode === 'installments' && <Input aria-label="Número de parcelas" type="number" min={2} max={120} {...f.bind('installments')} />}
              {v.mode === 'repeat' && <Input aria-label="Repetir por meses" type="number" min={2} max={60} {...f.bind('repeatMonths')} />}
            </div>
          </Field>
        )}
        {!onCard && (
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Checkbox id="e-paid" checked={v.paid} onChange={f.set('paid')} label="Já está paga" />
            {v.paid && <Input aria-label="Data do pagamento" type="date" className="w-44" {...f.bind('paidDate')} />}
          </div>
        )}
        {expense && grouped && (
          <div className="sm:col-span-2"><Checkbox id="e-group" checked={v.applyToGroup} onChange={f.set('applyToGroup')} label="Aplicar descrição/valor/categoria às próximas parcelas pendentes" /></div>
        )}
      </form>
    </Dialog>
  );
}
