import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Params } from '../api/client';
import { Agency, Customer, Manager, Paginated, Product, Prospect } from '../api/types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Estado de listado (página, orden, búsqueda, filtros) persistido en la URL. */
export function useListState(filterKeys: string[] = [], defaults: { sortBy?: string; sortDir?: 'asc' | 'desc' } = {}) {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const pageSize = Number(sp.get('pageSize') ?? 20) || 20;
  const sortBy = sp.get('sortBy') ?? defaults.sortBy;
  const sortDir = (sp.get('sortDir') as 'asc' | 'desc' | null) ?? defaults.sortDir ?? 'desc';
  const search = sp.get('search') ?? '';

  const set = (patch: Record<string, string | number | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage) next.delete('page');
    setSp(next, { replace: true });
  };

  const params: Params = {
    page, pageSize, search: search || undefined, sortBy, sortDir,
    ...Object.fromEntries(filterKeys.map((k) => [k, sp.get(k) ?? undefined])),
  };

  return {
    params, page, pageSize, sortBy, sortDir, search,
    filter: (k: string) => sp.get(k) ?? '',
    setFilter: (k: string, v: string) => set({ [k]: v }),
    setSearch: (v: string) => set({ search: v }),
    setPage: (p: number) => set({ page: p }, false),
    setPageSize: (s: number) => set({ pageSize: s }),
    toggleSort: (key: string) => set({ sortBy: key, sortDir: sortBy === key && sortDir === 'asc' ? 'desc' : 'asc' }, false),
  };
}

export function useList<T>(key: string, path: string, params: Params) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => api.get<Paginated<T>>(path, params),
    placeholderData: keepPreviousData,
  });
}

function useRef_<T>(key: string, path: string, params: Params = { pageSize: 200 }) {
  const q = useQuery({ queryKey: ['ref', key, params], queryFn: () => api.get<Paginated<T>>(path, params), staleTime: 60_000 });
  return useMemo(() => q.data?.data ?? [], [q.data]);
}

// Datos de referencia para selectores
export const useAgencyOptions = () => useRef_<Agency>('agencies', '/agencies');
export const useManagerOptions = (agencyId?: string) => useRef_<Manager>('managers', '/managers', { pageSize: 200, agencyId });
export const useProspectOptions = () => useRef_<Prospect>('prospects', '/prospects');
export const useCustomerOptions = () => useRef_<Customer>('customers', '/customers');
export function useProductOptions() {
  const q = useQuery({ queryKey: ['ref', 'products'], queryFn: () => api.get<Product[]>('/products'), staleTime: 60_000 });
  return q.data ?? [];
}
