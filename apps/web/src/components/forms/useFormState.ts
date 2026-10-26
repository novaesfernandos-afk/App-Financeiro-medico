import { useState } from 'react';

export function useFormState<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(k: K) => (v: T[K]) => setValues((s) => ({ ...s, [k]: v }));
  const bind = <K extends keyof T>(k: K) => ({
    value: values[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((s) => ({ ...s, [k]: e.target.value })),
  });
  return { values, setValues, set, bind, reset: () => setValues(initial) };
}

/** Converte '' em null/undefined antes de enviar para a API. */
export function nn(v: string | null | undefined) {
  return v === '' || v === undefined ? null : v;
}
export function undef(v: string | null | undefined) {
  return v === '' || v === null ? undefined : v;
}
