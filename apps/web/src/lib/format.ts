const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** Valores chegam da API como string decimal; Number é usado apenas para exibição. */
export function fmtBRL(v: string | number | null | undefined, opts?: { compact?: boolean }) {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  return (opts?.compact ? brlCompact : brl).format(n);
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fmtMonth(ym: string, style: 'long' | 'short' = 'long') {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return cap(new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: style, year: 'numeric', timeZone: 'UTC' }));
}

export function fmtHours(h: string | null | undefined) {
  if (!h) return '—';
  const n = Number(h);
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}

/** Normaliza entrada do usuário "1.234,56" -> "1234.56". */
export function parseMoneyInput(s: string): string {
  const t = s.trim().replace(/\s|R\$/g, '');
  if (!t) return '';
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  return t;
}

export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const currentYM = () => todayISO().slice(0, 7);
