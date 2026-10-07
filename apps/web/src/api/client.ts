export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

const BASE = '/api/v1';
export const SESSION_EXPIRED_EVENT = 'bange:session-expired';

function csrfToken(): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith('bange_csrf='));
  return match ? decodeURIComponent(match.split('=')[1]) : '';
}

export type Params = Record<string, string | number | boolean | undefined | null>;

export function buildQuery(params?: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: string, path: string, opts: { body?: unknown; params?: Params } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(opts.params)}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    let message = 'Error inesperado';
    let errors: ApiError['errors'];
    try {
      const data = await res.json();
      message = typeof data.message === 'string' ? data.message : message;
      errors = data.errors;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, message, errors);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** URL de descarga que reutiliza los filtros activos (la cookie de sesión autentica la petición). */
export const exportUrl = (path: string, params: Params, format: 'csv' | 'xlsx' | 'pdf') =>
  `${BASE}${path}${buildQuery({ ...params, page: undefined, pageSize: undefined, format })}`;
