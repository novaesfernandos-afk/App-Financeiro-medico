export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('mf:unauthorized'));
    throw new ApiError(res.status, data?.error ?? 'Erro inesperado', data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T = any>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T = any>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | undefined | null | string[]>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    s.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

/** Mensagem amigável para erros de validação vindos da API. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = e.data?.details?.fieldErrors as Record<string, string[]> | undefined;
    const first = fields && Object.entries(fields).find(([, v]) => v?.length);
    if (first) return `${first[0]}: ${first[1][0]}`;
    const form = e.data?.details?.formErrors as string[] | undefined;
    if (form?.length) return form[0]!;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Erro inesperado';
}
