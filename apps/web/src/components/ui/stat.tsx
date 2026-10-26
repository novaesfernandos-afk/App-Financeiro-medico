import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Bloco de KPI: rótulo, valor principal e nota explicando a natureza do número. */
export function Stat({ label, value, note, icon, tone, className, testId }: {
  label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode; tone?: 'positive' | 'negative' | 'warning'; className?: string; testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn('rounded-2xl border bg-surface p-4 animate-fade-in', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p className={cn('mt-2 text-lg font-semibold tabular tracking-tight sm:text-xl',
        tone === 'positive' && 'text-positive', tone === 'negative' && 'text-negative', tone === 'warning' && 'text-warning')}>
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}
