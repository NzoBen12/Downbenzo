import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Visit } from '../api/types';
import { Can, useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/FilterBar';
import { Button, ErrorState, LoadingState, Select, Tabs } from '../components/ui';
import { VISIT_STATUS } from '../lib/format';
import { useAgencyOptions, useManagerOptions } from '../lib/hooks';
import { VisitForm } from './Visits';

type View = 'month' | 'week' | 'day';
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

/** Rango visible: mes completo (con semanas parciales), semana o día. */
export function visibleRange(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === 'week') { const m = mondayOf(anchor); return { from: m, to: addDays(m, 7) }; }
  const first = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: first, to: addDays(mondayOf(lastOfMonth), 7) };
}

export function CalendarPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [filters, setFilters] = useState({ agencyId: '', managerId: '', status: '' });
  const [creating, setCreating] = useState<string | null>(null);
  const agencies = useAgencyOptions();
  const managers = useManagerOptions(filters.agencyId || undefined);
  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar', range.from.toISOString(), range.to.toISOString(), filters],
    queryFn: () => api.get<Visit[]>('/visits/calendar', { from: range.from.toISOString(), to: range.to.toISOString(), ...filters }),
  });
  const visits = data ?? [];
  const byDay = (d: Date) => visits.filter((v) => sameDay(new Date(v.scheduledAt), d));
  const days: Date[] = [];
  for (let d = range.from; d < range.to; d = addDays(d, 1)) days.push(d);

  const shift = (dir: number) => setAnchor((a) => view === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * (view === 'week' ? 7 : 1)));
  const title = anchor.toLocaleDateString('es-ES', view === 'day' ? { dateStyle: 'full' } : { month: 'long', year: 'numeric' });
  const hhmm = (v: Visit) => new Date(v.scheduledAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const label = (v: Visit) => `${hhmm(v)} ${v.prospect?.fullName ?? v.customer?.fullName ?? 'Visita'} · ${v.manager.fullName}`;
  const eventBtn = (v: Visit) => <button key={v.id} className={`cal-event ${v.status}`} title={`${label(v)} (${VISIT_STATUS[v.status].label})`} onClick={(e) => { e.stopPropagation(); navigate(`/visits/${v.id}`); }}>{label(v)}</button>;
  const startOfCreate = (d: Date) => { const x = new Date(d); x.setHours(9, 0, 0, 0); return x.toISOString(); };
  const openCreate = (d: Date) => { if (can('visits.create')) setCreating(startOfCreate(d)); };

  return (
    <>
      <PageHead title="Calendario" actions={<Can permission="visits.create"><Button onClick={() => setCreating(startOfCreate(new Date()))}>Nueva visita</Button></Can>} />
      <div className="filters">
        <div className="row" role="group" aria-label="Navegación del calendario">
          <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Anterior">‹</Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>Hoy</Button>
          <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Siguiente">›</Button>
          <strong style={{ textTransform: 'capitalize' }} aria-live="polite">{title}</strong>
        </div>
        <Select label="Agencia" value={filters.agencyId} onChange={(e) => setFilters({ ...filters, agencyId: e.target.value, managerId: '' })} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" value={filters.managerId} onChange={(e) => setFilters({ ...filters, managerId: e.target.value })} placeholder="Todos">{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        <Select label="Estado" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} placeholder="Todos">{Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      <Tabs label="Vista del calendario" value={view} onChange={setView} tabs={[{ id: 'month', label: 'Mensual' }, { id: 'week', label: 'Semanal' }, { id: 'day', label: 'Diaria' }]} />
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? <LoadingState /> : view === 'day' ? (
        <div className="cal-list card" aria-label="Visitas del día">
          {byDay(anchor).length === 0 ? <p>No hay visitas este día.</p> : byDay(anchor).map(eventBtn)}
        </div>
      ) : (
        <div className="cal-grid" role="grid" aria-label={`Calendario ${title}`}>
          {DAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
          {days.map((d) => (
            <div key={d.toISOString()} role="gridcell" tabIndex={0}
              className={`cal-cell ${view === 'month' && d.getMonth() !== anchor.getMonth() ? 'out' : ''} ${sameDay(d, new Date()) ? 'today' : ''}`}
              aria-label={`${d.toLocaleDateString('es-ES', { dateStyle: 'full' })}: ${byDay(d).length} visitas`}
              onClick={() => openCreate(d)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCreate(d); } }}>
              <span className="cal-day">{d.getDate()}</span>
              {byDay(d).slice(0, view === 'week' ? 50 : 3).map(eventBtn)}
              {view === 'month' && byDay(d).length > 3 && <small>+{byDay(d).length - 3} más</small>}
            </div>
          ))}
        </div>
      )}
      {creating && <VisitForm initialDate={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
