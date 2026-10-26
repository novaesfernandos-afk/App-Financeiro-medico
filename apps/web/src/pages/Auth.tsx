import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { api, ApiError, errorMessage } from '@/lib/api';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', mfaCode: '' });
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const me = mode === 'register'
        ? await api.post('/auth/register', { name: form.name, email: form.email, password: form.password })
        : await api.post('/auth/login', { email: form.email, password: form.password, mfaCode: form.mfaCode || undefined });
      qc.setQueryData(['me'], me);
      navigate(me.onboardingDone ? '/' : '/boas-vindas', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.data?.mfaRequired) setMfaRequired(true);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.35),transparent_60%),radial-gradient(ellipse_at_bottom_right,hsl(var(--accent)/0.25),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-10 w-10" />
            <span className="text-lg font-semibold">MedFinance AI</span>
          </div>
          <div className="max-w-md space-y-4">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">Quanto você ganha, recebe, gasta e investe — com clareza.</h2>
            <p className="text-sm text-muted">Plantões, vínculos CLT e PJ, impostos por fonte e calendário financeiro em um só lugar. Seus dados ficam isolados e criptografados em trânsito.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4" /> LGPD · MFA · Auditoria de operações</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 animate-fade-in">
          <div className="space-y-1">
            <img src="/icon.svg" alt="" className="mb-4 h-10 w-10 lg:hidden" />
            <h1 className="text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
            <p className="text-sm text-muted">{mode === 'login' ? 'Acesse seu painel financeiro.' : 'Leva menos de dois minutos.'}</p>
          </div>
          {mode === 'register' && (
            <Field label="Nome completo" htmlFor="name"><Input id="name" autoComplete="name" required value={form.name} onChange={set('name')} /></Field>
          )}
          <Field label="E-mail" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></Field>
          <Field label="Senha" htmlFor="password" hint={mode === 'register' ? 'Mínimo de 10 caracteres, com letras e números.' : undefined}>
            <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={form.password} onChange={set('password')} />
          </Field>
          {mfaRequired && (
            <Field label="Código do autenticador (MFA)" htmlFor="mfa">
              <Input id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required value={form.mfaCode} onChange={set('mfaCode')} />
            </Field>
          )}
          {error && <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</Button>
          <p className="text-center text-sm text-muted">
            {mode === 'login' ? <>Não tem conta? <Link className="font-medium text-primary" to="/cadastro">Cadastre-se</Link></> : <>Já tem conta? <Link className="font-medium text-primary" to="/entrar">Entrar</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}
