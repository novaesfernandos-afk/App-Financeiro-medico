import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'positive' | 'warning' | 'negative' | 'primary';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  info: 'bg-info/10 text-info',
  positive: 'bg-positive/10 text-positive',
  warning: 'bg-warning/15 text-warning',
  negative: 'bg-negative/10 text-negative',
  primary: 'bg-primary/10 text-primary',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} aria-label="Carregando" />;
}

export function PageLoader() {
  return <div className="flex h-48 items-center justify-center"><Spinner /></div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Indicador de natureza do valor: real × estimado × projetado (regra de transparência). */
export function CertaintyDot({ certainty }: { certainty: string }) {
  const map: Record<string, [string, string]> = {
    REAL: ['bg-positive', 'Realizado'],
    ESTIMATED: ['bg-warning', 'Estimado'],
    PROJECTED: ['bg-muted', 'Projetado'],
  };
  const [cls, label] = map[certainty] ?? ['bg-muted', certainty];
  return <span title={label} aria-label={label} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', cls)} />;
}
