import { CalendarDays, ChevronLeft, ChevronRight, Landmark, LayoutDashboard, LogOut, Moon, Receipt, Settings, Stethoscope, Sun, Wallet } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { shiftMonth } from '@/hooks/useMonth';
import { useTheme } from '@/hooks/useTheme';
import { fmtMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/plantoes', label: 'Plantões', icon: Stethoscope },
  { to: '/receitas', label: 'Receitas', icon: Wallet },
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/impostos', label: 'Impostos', icon: Landmark },
  { to: '/configuracoes', label: 'Ajustes', icon: Settings },
];
const MOBILE_NAV = NAV.filter((n) => ['/', '/calendario', '/plantoes', '/despesas', '/configuracoes'].includes(n.to));

export function AppShell() {
  const { me, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { search } = useLocation();
  const isDark = theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold leading-tight">MedFinance AI</p>
            <p className="text-[11px] text-muted">Finanças médicas</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={{ pathname: to, search }}
              end={end}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-primary/10 font-medium text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t pt-3">
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} Tema {isDark ? 'claro' : 'escuro'}
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <LogOut className="h-4 w-4" /> Sair
          </button>
          <p className="truncate px-3 pt-2 text-[11px] text-muted" title={me?.email}>{me?.name}</p>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="text-sm font-semibold">MedFinance</span>
          </div>
          <div className="flex items-center gap-1">
            <button aria-label="Alternar tema" onClick={() => setTheme(isDark ? 'light' : 'dark')} className="rounded-lg p-2 text-muted hover:bg-surface-2">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <NavLink to="/receitas" aria-label="Receitas" className="rounded-lg p-2 text-muted hover:bg-surface-2"><Wallet className="h-4 w-4" /></NavLink>
            <NavLink to="/impostos" aria-label="Impostos" className="rounded-lg p-2 text-muted hover:bg-surface-2"><Landmark className="h-4 w-4" /></NavLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <Outlet />
        </main>
      </div>

      {/* Navegação inferior (mobile) */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={{ pathname: to, search }} end={end}
            className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[10px]', isActive ? 'text-primary' : 'text-muted')}>
            <Icon className="h-5 w-5" aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (ym: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border bg-surface">
      <button aria-label="Mês anterior" className="p-2 text-muted hover:text-fg" onClick={() => onChange(shiftMonth(value, -1))}><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-[132px] text-center text-sm font-medium capitalize" data-testid="month-label">{fmtMonth(value)}</span>
      <button aria-label="Próximo mês" className="p-2 text-muted hover:text-fg" onClick={() => onChange(shiftMonth(value, 1))}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}
