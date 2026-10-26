import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useApiMutation, useList } from '@/lib/queries';

export type FieldDef =
  | { name: string; label: string; type: 'text' | 'date' | 'number'; required?: boolean; hint?: string; placeholder?: string }
  | { name: string; label: string; type: 'money'; required?: boolean; hint?: string }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; required?: boolean; hint?: string };

/** CRUD genérico para cadastros simples (contas, cartões, empresas, metas). */
export function SimpleCrud({ title, subtitle, endpoint, fields, render, defaults = {}, emptyText }: {
  title: string; subtitle?: string; endpoint: string; fields: FieldDef[]; render: (row: any) => ReactNode; defaults?: Record<string, any>; emptyText: string;
}) {
  const toast = useToast();
  const list = useList<any[]>([endpoint.slice(1)], endpoint);
  const [editing, setEditing] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const save = useApiMutation(async () => {
    const body: Record<string, any> = {};
    for (const f of fields) {
      const v = values[f.name];
      body[f.name] = f.type === 'number' ? (v === '' || v === undefined ? undefined : Number(v)) : v === '' ? (f.required ? v : null) : v;
    }
    return editing?.id ? api.patch(`${endpoint}/${editing.id}`, body) : api.post(endpoint, body);
  });
  const del = useApiMutation((id: string) => api.del(`${endpoint}/${id}`));

  const open = (row: any) => {
    setEditing(row);
    setValues(Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? defaults[f.name] ?? ''])));
  };

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={<Button size="sm" variant="outline" onClick={() => open({})}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>} />
      {!list.data?.length ? <p className="text-sm text-muted">{emptyText}</p> : (
        <ul className="divide-y">
          {list.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 text-sm">{render(row)}</div>
              <div className="flex shrink-0">
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => open(row)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Remover" onClick={async () => { try { await del.mutateAsync(row.id); toast('Removido'); } catch (e) { toast(errorMessage(e), 'error'); } }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)} title={`${editing.id ? 'Editar' : 'Adicionar'} — ${title}`}
          footer={<Button form={`crud-${endpoint}`} type="submit" loading={save.isPending}>Salvar</Button>}>
          <form id={`crud-${endpoint}`} className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            try { await save.mutateAsync(undefined); toast('Salvo'); setEditing(null); } catch (err) { toast(errorMessage(err), 'error'); }
          }}>
            {fields.map((f) => (
              <Field key={f.name} label={f.label} hint={f.hint} htmlFor={`f-${f.name}`}>
                {f.type === 'money' ? <MoneyInput id={`f-${f.name}`} required={f.required} value={values[f.name] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
                  : f.type === 'select' ? (
                    <Select id={`f-${f.name}`} required={f.required} value={values[f.name] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}>
                      {!f.required && <option value="">—</option>}
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : <Input id={`f-${f.name}`} type={f.type} required={f.required} placeholder={'placeholder' in f ? f.placeholder : undefined}
                    value={values[f.name] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))} />}
              </Field>
            ))}
          </form>
        </Dialog>
      )}
    </Card>
  );
}
