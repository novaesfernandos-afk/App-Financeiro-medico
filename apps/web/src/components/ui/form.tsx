import { forwardRef, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { parseMoneyInput } from '@/lib/format';

const control = 'w-full rounded-xl border bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-10', className)} {...props} />
));
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, 'h-10 pr-8', className)} {...props}>{children}</select>
));
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-[72px] py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">{label}</label>
      {children}
      {error ? <p className="text-xs text-negative">{error}</p> : hint ? <p className="text-xs text-muted/80">{hint}</p> : null}
    </div>
  );
}

/** Campo monetário: aceita "1.234,56" ou "1234.56" e devolve string decimal para a API. */
export function MoneyInput({ value, onChange, id, placeholder = '0,00', required, ...rest }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string; required?: boolean; disabled?: boolean; 'aria-label'?: string }) {
  const [text, setText] = useState(value ? value.replace('.', ',') : '');
  useEffect(() => {
    if (parseMoneyInput(text) !== value) setText(value ? value.replace('.', ',') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        className="pl-9 tabular"
        placeholder={placeholder}
        required={required}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '');
          setText(t);
          onChange(parseMoneyInput(t));
        }}
        {...rest}
      />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; id?: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
