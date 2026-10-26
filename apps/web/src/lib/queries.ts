import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';

export const useList = <T = any>(key: QueryKey, url: string, enabled = true) =>
  useQuery<T>({ queryKey: key, queryFn: () => api.get<T>(url), enabled });

/** Qualquer mutação financeira invalida todas as consultas — dashboard, calendário e listas ficam consistentes. */
export function useApiMutation<TVars = any, TData = any>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}

export const useInstitutions = () => useList<any[]>(['institutions'], '/institutions');
export const useContracts = () => useList<any[]>(['contracts'], '/contracts');
export const useTaxProfiles = () => useList<any[]>(['tax-profiles'], '/tax-profiles');
export const useCategories = () => useList<any[]>(['expense-categories'], '/expense-categories');
export const useCards = () => useList<any[]>(['cards'], '/cards');
export const useAccounts = () => useList<any[]>(['accounts'], '/accounts');
export const useCompanies = () => useList<any[]>(['companies'], '/companies');
