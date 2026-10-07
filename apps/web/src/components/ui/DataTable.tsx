import { ReactNode } from 'react';
import { Paginated } from '../../api/types';
import { Button } from './Button';
import { EmptyState, ErrorState, LoadingState } from './Display';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

interface Props<T extends { id: string }> {
  columns: Column<T>[];
  result?: Paginated<T>;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowActions?: (row: T) => ReactNode;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  caption: string;
  emptyMessage?: string;
}

export function DataTable<T extends { id: string }>(p: Props<T>) {
  if (p.error) return <ErrorState error={p.error} onRetry={p.onRetry} />;
  if (p.isLoading && !p.result) return <LoadingState />;
  const rows = p.result?.data ?? [];
  const meta = p.result?.meta;
  const selectable = Boolean(p.onSelect);
  const ids = rows.map((r) => r.id);
  const allSelected = selectable && ids.length > 0 && ids.every((i) => p.selected?.includes(i));

  return (
    <div aria-busy={p.isLoading}>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">{p.caption}</caption>
          <thead>
            <tr>
              {selectable && (
                <th scope="col"><input type="checkbox" aria-label="Seleccionar todas las filas" checked={allSelected} onChange={(e) => p.onSelect!(e.target.checked ? ids : [])} /></th>
              )}
              {p.columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={p.sortBy === c.key ? (p.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable && p.onSort ? <button onClick={() => p.onSort!(c.key)}>{c.header}{p.sortBy === c.key ? (p.sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</button> : c.header}
                </th>
              ))}
              {p.rowActions && <th scope="col"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} aria-selected={p.selected?.includes(r.id) || undefined}>
                {selectable && (
                  <td><input type="checkbox" aria-label="Seleccionar fila" checked={p.selected?.includes(r.id) ?? false} onChange={(e) => p.onSelect!(e.target.checked ? [...(p.selected ?? []), r.id] : (p.selected ?? []).filter((i) => i !== r.id))} /></td>
                )}
                {p.columns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                {p.rowActions && <td><div className="row">{p.rowActions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState message={p.emptyMessage ?? 'No hay registros que coincidan con los filtros.'} />}
      </div>
      {meta && (
        <nav className="pagination" aria-label="Paginación">
          <span>{meta.total} resultado{meta.total === 1 ? '' : 's'} · Página {meta.page} de {meta.totalPages}</span>
          <div className="row">
            <label className="row" style={{ gap: 4 }}>Por página
              <select className="input" style={{ width: 'auto', minHeight: 32 }} value={p.pageSize} onChange={(e) => p.onPageSize(Number(e.target.value))}>
                {[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => p.onPage(meta.page - 1)}>Anterior</Button>
            <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => p.onPage(meta.page + 1)}>Siguiente</Button>
          </div>
        </nav>
      )}
    </div>
  );
}
