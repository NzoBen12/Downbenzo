import { ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { Button } from './Button';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && <header>{title && <h2>{title}</h2>}{actions}</header>}
      {children}
    </section>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card metric" role="group" aria-label={label}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <div className="state" role="status" aria-live="polite"><div className="spinner" aria-hidden="true" /><span>{label}</span></div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div role="status" aria-label="Cargando" style={{ display: 'grid', gap: 10 }}>{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />)}</div>;
}

export function EmptyState({ title = 'Sin resultados', message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return <div className="state"><strong>{title}</strong>{message && <span>{message}</span>}{action}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = status === 403 ? 'No tiene permiso para ver este contenido.' : status === 404 ? 'No se encontró el recurso solicitado.' : error instanceof Error ? error.message : 'Error inesperado';
  return (
    <div className="state error" role="alert">
      <strong>{status === 403 ? 'No autorizado' : 'Se produjo un error'}</strong>
      <span>{message}</span>
      {onRetry && status !== 403 && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}
