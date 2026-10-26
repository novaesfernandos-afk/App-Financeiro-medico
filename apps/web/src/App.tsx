import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { PageLoader } from './components/ui/misc';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/Auth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Incomes = lazy(() => import('./pages/Incomes'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Taxes = lazy(() => import('./pages/Taxes'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

export function App() {
  const { me, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="flex min-h-dvh items-center justify-center"><PageLoader /></div>;

  if (!me) {
    return (
      <Routes>
        <Route path="/entrar" element={<AuthPage mode="login" />} />
        <Route path="/cadastro" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/entrar" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/boas-vindas" element={<Onboarding />} />
        {!me.onboardingDone && <Route path="*" element={<Navigate to="/boas-vindas" replace />} />}
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="plantoes" element={<Shifts />} />
          <Route path="receitas" element={<Incomes />} />
          <Route path="despesas" element={<Expenses />} />
          <Route path="impostos" element={<Taxes />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
