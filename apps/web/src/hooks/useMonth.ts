import { useSearchParams } from 'react-router-dom';
import { currentYM } from '@/lib/format';

/** Mês selecionado sincronizado com a URL (?mes=YYYY-MM) — links compartilháveis e navegação consistente. */
export function useMonth(): [string, (ym: string) => void] {
  const [params, setParams] = useSearchParams();
  const month = params.get('mes') ?? currentYM();
  return [month, (ym) => setParams((p) => { p.set('mes', ym); return p; }, { replace: true })];
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
