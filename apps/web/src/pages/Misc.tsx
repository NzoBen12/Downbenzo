import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ActionItem, Goal, ReportData } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ExportMenu, PageHead } from '../components/FilterBar';
import { Badge, Card, DatePicker, EmptyState, ErrorState, Select, Skeleton, Tabs } from '../components/ui';
import { formatDate, formatNumber } from '../lib/format';
import { useAgencyOptions, useManagerOptions } from '../lib/hooks';

const REPORTS = [
  { id: 'activity', label: 'Actividad comercial' },
  { id: 'manager-performance', label: 'Rendimiento por gestor' },
  { id: 'agency-performance', label: 'Rendimiento por agencia' },
  { id: 'products', label: 'Productos' },
  { id: 'currency', label: 'Divisas' },
  { id: 'prospects', label: 'Prospectos' },
] as const;

export function ReportsPage() {
  const [type, setType] = useState<(typeof REPORTS)[number]['id']>('activity');
  const [f, setF] = useState({ from: '', to: '', agencyId: '', managerId: '', status: '' });
  const agencies = useAgencyOptions();
  const managers = useManagerOptions(f.agencyId || undefined);
  const params = { from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined, agencyId: f.agencyId, managerId: f.managerId, status: f.status };
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['report', type, params], queryFn: () => api.get<ReportData>(`/reports/${type}`, params) });
  return (
    <>
      <PageHead title="Informes" actions={<ExportMenu path={`/reports/${type}`} params={params} />} />
      <Tabs label="Tipo de informe" value={type} onChange={setType} tabs={REPORTS.map((r) => ({ id: r.id, label: r.label }))} />
      <div className="filters">
        <DatePicker label="Desde" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <DatePicker label="Hasta" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Select label="Agencia" value={f.agencyId} onChange={(e) => setF({ ...f, agencyId: e.target.value, managerId: '' })} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })} placeholder="Todos">{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
      </div>
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading || !data ? <Skeleton lines={6} /> : data.rows.length === 0 ? <EmptyState /> : (
        <div className="table-wrap"><table className="table">
          <caption className="sr-only">{data.title}</caption>
          <thead><tr>{data.columns.map((c) => <th key={c.key} scope="col">{c.header}</th>)}</tr></thead>
          <tbody>{data.rows.map((r, i) => <tr key={i}>{data.columns.map((c) => <td key={c.key}>{typeof r[c.key] === 'number' ? formatNumber(r[c.key]) : String(r[c.key] ?? '—')}</td>)}</tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}

type InfoTab = 'goals' | 'actions' | 'help';

export function InformationPage() {
  const [tab, setTab] = useState<InfoTab>('goals');
  const { can } = useAuth();
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals'), enabled: tab === 'goals' && can('goals.read') });
  const actions = useQuery({ queryKey: ['actions'], queryFn: () => api.get<ActionItem[]>('/actions'), enabled: tab === 'actions' && can('actions.read') });
  return (
    <>
      <PageHead title="Información" />
      <Tabs label="Información" value={tab} onChange={setTab} tabs={[{ id: 'goals', label: 'Objetivos' }, { id: 'actions', label: 'Acciones' }, { id: 'help', label: 'Ayuda' }]} />
      {tab === 'goals' && (goals.error ? <ErrorState error={goals.error} /> : !goals.data ? <Skeleton /> : goals.data.length === 0 ? <EmptyState title="Sin objetivos" /> : (
        <div className="grid cols-3">{goals.data.map((g) => {
          const pct = Math.min(100, Math.round((Number(g.currentValue) / Number(g.targetValue)) * 100));
          return <Card key={g.id} title={g.title} actions={<Badge tone={g.status === 'ACHIEVED' ? 'ok' : g.status === 'MISSED' ? 'danger' : 'info'}>{pct}%</Badge>}>
            <div className="bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={g.title}><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
            <p style={{ marginBottom: 0 }}>{formatNumber(g.currentValue)} / {formatNumber(g.targetValue)} · {formatDate(g.periodStart)} – {formatDate(g.periodEnd)}</p></Card>;
        })}</div>
      ))}
      {tab === 'actions' && (actions.error ? <ErrorState error={actions.error} /> : !actions.data ? <Skeleton /> : (
        <Card><ul className="plain">{actions.data.map((a) => <li key={a.id}>{a.title} {a.dueDate && <small>· vence {formatDate(a.dueDate)}</small>} <Badge tone={a.status === 'DONE' ? 'ok' : 'info'}>{a.status === 'DONE' ? 'Hecha' : a.status === 'CANCELLED' ? 'Cancelada' : 'Pendiente'}</Badge></li>)}</ul></Card>
      ))}
      {tab === 'help' && (
        <Card title="Guía rápida">
          <ul className="plain">
            <li><strong>Visitas:</strong> planifique desde “Visitas” o directamente en el <Link to="/calendar">Calendario</Link>. Estados: Planificada, Realizada/Exitosa, Sin éxito, Diferida, Anulada.</li>
            <li><strong>Puntuación:</strong> porcentaje de visitas exitosas sobre las resueltas (exitosas + sin éxito).</li>
            <li><strong>Exportación:</strong> los botones CSV/Excel/PDF respetan los filtros activos.</li>
            <li><strong>Tarjetas:</strong> sólo se gestiona el PAN enmascarado; nunca se almacena el número completo.</li>
            <li><strong>Permisos:</strong> las acciones disponibles dependen de su rol; el servidor siempre valida el permiso.</li>
          </ul>
        </Card>
      )}
    </>
  );
}

export function NotFoundPage() {
  return <EmptyState title="Página no encontrada" message="La ruta solicitada no existe." action={<Link className="btn secondary" to="/">Ir al inicio</Link>} />;
}

export function ForbiddenPage() {
  return <EmptyState title="No autorizado" message="No tiene permiso para acceder a esta sección." action={<Link className="btn secondary" to="/">Ir al inicio</Link>} />;
}
