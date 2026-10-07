import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildQuery, exportUrl, SESSION_EXPIRED_EVENT } from './client';

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('buildQuery omite valores vacíos', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x' })).toBe('?a=1&d=x');
    expect(buildQuery({})).toBe('');
  });

  it('exportUrl conserva filtros y descarta paginación', () => {
    const url = exportUrl('/visits/export', { status: 'PLANNED', page: 3, pageSize: 20 }, 'csv');
    expect(url).toBe('/api/v1/visits/export?status=PLANNED&format=csv');
  });

  it('envía el token CSRF en mutaciones', async () => {
    document.cookie = 'bange_csrf=tok123';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    await api.post('/visits', { a: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok123');
    await api.get('/visits');
    expect(((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
  });

  it('lanza ApiError con detalle de validación', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Datos inválidos', errors: [{ path: 'x', message: 'mal' }] }), { status: 400 }));
    await expect(api.post('/x', {})).rejects.toMatchObject({ status: 400, message: 'Datos inválidos', errors: [{ path: 'x', message: 'mal' }] });
  });

  it('emite evento de sesión expirada en 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"x"}', { status: 401 }));
    const handler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    await expect(api.get('/agencies')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  });

  it('un 401 en login no dispara sesión expirada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"message":"x"}', { status: 401 }));
    const handler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  });
});
