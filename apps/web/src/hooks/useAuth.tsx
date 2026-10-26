import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

export interface Me {
  id: string;
  name: string;
  email: string;
  mfaEnabled: boolean;
  onboardingDone: boolean;
  theme?: string;
}

const Ctx = createContext<{ me: Me | null; loading: boolean; refresh: () => Promise<unknown>; logout: () => Promise<void> }>({
  me: null, loading: true, refresh: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const h = () => qc.setQueryData(['me'], null);
    window.addEventListener('mf:unauthorized', h);
    return () => window.removeEventListener('mf:unauthorized', h);
  }, [qc]);

  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    qc.setQueryData(['me'], null);
  };

  return <Ctx.Provider value={{ me: q.data ?? null, loading: q.isLoading, refresh: q.refetch, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
