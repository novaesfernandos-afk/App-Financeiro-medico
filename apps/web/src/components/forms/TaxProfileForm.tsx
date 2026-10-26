import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { useApiMutation, useCompanies } from '@/lib/queries';
import { cleanComponents, TaxComponentsEditor, type TaxComponentDraft } from './TaxComponentsEditor';
import { nn, useFormState } from './useFormState';

/** Cria perfil tributário (com 1ª vigência) ou adiciona nova vigência a um perfil existente. */
export function TaxProfileForm({ open, onOpenChange, profile, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; profile?: any; onSaved?: (p: any) => void }) {
  const toast = useToast();
  const companies = useCompanies();
  const isNewVersion = Boolean(profile);
  const f = useFormState({
    name: '', scope: 'PJ', companyId: '', description: '',
    validFrom: `${todayISO().slice(0, 4)}-01-01`, validTo: '', confidence: 'ESTIMATED', legalReference: '', source: '', notes: '',
  });
  const [components, setComponents] = useState<TaxComponentDraft[]>(
    profile?.versions?.[0]?.components?.map((c: any) => ({ ...c })) ?? [],
  );
  const save = useApiMutation(async () => {
    const version = {
      validFrom: f.values.validFrom, validTo: nn(f.values.validTo), confidence: f.values.confidence,
      components: cleanComponents(components), legalReference: nn(f.values.legalReference), source: nn(f.values.source), notes: nn(f.values.notes),
    };
    if (isNewVersion) return api.post(`/tax-profiles/${profile.id}/versions`, version);
    return api.post('/tax-profiles', { name: f.values.name, scope: f.values.scope, companyId: nn(f.values.companyId), description: nn(f.values.description), version });
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await save.mutateAsync(undefined);
      toast(isNewVersion ? 'Nova vigência registrada' : 'Perfil tributário criado');
      onSaved?.(p);
      onOpenChange(false);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide
      title={isNewVersion ? `Nova vigência — ${profile.name}` : 'Novo perfil tributário'}
      description="Informe a carga tributária efetiva orientada pelo seu contador. O sistema não aplica alíquotas genéricas."
      footer={<Button form="tax-form" type="submit" loading={save.isPending}>Salvar</Button>}>
      <form id="tax-form" onSubmit={submit} className="space-y-4">
        {!isNewVersion && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do perfil" htmlFor="tp-name" hint="Ex.: PJ Simples — Hospital A"><Input id="tp-name" required {...f.bind('name')} /></Field>
            <Field label="Âmbito" htmlFor="tp-scope">
              <Select id="tp-scope" {...f.bind('scope')}>
                <option value="PJ">Pessoa jurídica</option><option value="PF">Pessoa física (autônomo)</option>
                <option value="CLT">CLT (folha)</option><option value="OUTRO">Outro</option>
              </Select>
            </Field>
            {f.values.scope === 'PJ' && (
              <Field label="Empresa" htmlFor="tp-company" className="sm:col-span-2">
                <Select id="tp-company" {...f.bind('companyId')}>
                  <option value="">—</option>
                  {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Vigente a partir de" htmlFor="tp-from"><Input id="tp-from" type="date" required {...f.bind('validFrom')} /></Field>
          <Field label="Até (opcional)" htmlFor="tp-to"><Input id="tp-to" type="date" {...f.bind('validTo')} /></Field>
          <Field label="Natureza" htmlFor="tp-conf">
            <Select id="tp-conf" {...f.bind('confidence')}>
              <option value="ESTIMATED">Estimativa</option>
              <option value="CONFIRMED">Confirmado pelo contador</option>
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Tributos incidentes</p>
          <TaxComponentsEditor value={components} onChange={setComponents} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Referência legal" htmlFor="tp-law" hint="Ex.: LC 123/2006, Anexo III"><Input id="tp-law" {...f.bind('legalReference')} /></Field>
          <Field label="Fonte" htmlFor="tp-src" hint="Ex.: orientação do contador em 03/2025"><Input id="tp-src" {...f.bind('source')} /></Field>
        </div>
      </form>
    </Dialog>
  );
}
