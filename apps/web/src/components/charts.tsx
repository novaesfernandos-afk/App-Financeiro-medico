import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtBRL } from '@/lib/format';

/**
 * Gráficos seguem a skill de dataviz: marcas finas com cantos de 4px na ponta,
 * eixo único, grid recessivo, tooltip por marca, cores por identidade (série fixa).
 */
const axis = { stroke: 'hsl(var(--muted))', fontSize: 11, tickLine: false, axisLine: false } as const;

export function ChartTooltip({ active, payload, label, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 tabular text-muted">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-fg">{fmtBRL(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function GroupedBars({ data, series, xKey, xFormatter, height = 240 }: {
  data: any[]; series: { key: string; name: string; color: string }[]; xKey: string; xFormatter?: (v: string) => string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey={xKey} {...axis} tickFormatter={xFormatter} interval="preserveStartEnd" />
        <YAxis {...axis} width={56} tickFormatter={(v) => fmtBRL(v, { compact: true })} />
        <Tooltip cursor={{ fill: 'hsl(var(--surface-2))' }} content={<ChartTooltip labelFormatter={xFormatter} />} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted))' }} />
        {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais ranqueadas com rótulo e valor em texto (identidade nunca só pela cor). */
export function RankBars({ rows, color = 'var(--series-1)', extra }: {
  rows: { id: string; label: string; value: number; extra?: ReactNode }[]; color?: string; extra?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="group" title={`${r.label}: ${fmtBRL(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular font-medium">
              {fmtBRL(r.value)}
              {extra && r.extra ? <span className="ml-2 font-normal text-muted">{r.extra}</span> : null}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-[width] duration-500 group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
