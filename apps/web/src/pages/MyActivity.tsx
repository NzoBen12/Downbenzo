import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ActionItem, Goal, Visit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PageHead } from '../components/FilterBar';
import { Card, EmptyState, ErrorState, MetricCard, Skeleton } from '../components/ui';
import { formatDate, formatDateTime, formatNumber } from '../lib/format';
import { StatusBadge } from './Visits';

const day = 86_400_000;

/** Panel personal del gestor: visitas de hoy y de los próximos 7 días, acciones pendientes y objetivos. */
export function MyActivityPage() {
  const { user, can } = useAuth();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const from = start.toISOString();
  const to = new Date(start.getTime() + 7 * day).toISOString();
  const visits = useQuery({ queryKey: ['my-visits', from], queryFn: () => api.get<Visit[]>('/visits/calendar', { from, to, status: 'PLANNED' }), enabled: can('visits.read') });
  const actions = useQuery({ queryKey: ['actions'], queryFn: () => api.get<ActionItem[]>('/actions'), enabled: can('actions.read') });
  const goals = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals'), enabled: can('goals.read') });

  const endOfToday = start.getTime() + day;
  const today = (visits.data ?? []).filter((v) => new Date(v.scheduledAt).getTime() < endOfToday);
  const upcoming = (visits.data ?? []).filter((v) => new Date(v.scheduledAt).getTime() >= endOfToday);
  const pending = (actions.data ?? []).filter((a) => a.status === 'PENDING');

  return (
    <>
      <PageHead title={`Hola, ${user?.fullName.split(' ')[0] ?? ''}`} crumbs={<span>Mi actividad</span>} />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <MetricCard label="Visitas hoy" value={visits.data ? today.length : '…'} />
        <MetricCard label="Próximos 7 días" value={visits.data ? upcoming.length : '…'} />
        <MetricCard label="Acciones pendientes" value={actions.data ? pending.length : '…'} />
      </div>
      <div className="grid cols-2">
        <Card title="Visitas de hoy">
          {visits.error ? <ErrorState error={visits.error} onRetry={() => void visits.refetch()} /> : !visits.data ? <Skeleton /> : today.length === 0 ? <EmptyState title="Sin visitas hoy" /> : (
            <ul className="plain">{today.map((v) => <li key={v.id}><Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> · {v.prospect?.fullName ?? v.customer?.fullName} · {v.agency.name} <StatusBadge status={v.status} /></li>)}</ul>
          )}
        </Card>
        <Card title="Próximas visitas">
          {!visits.data ? <Skeleton /> : upcoming.length === 0 ? <EmptyState title="Nada planificado" /> : (
            <ul className="plain">{upcoming.slice(0, 8).map((v) => <li key={v.id}><Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> · {v.prospect?.fullName ?? v.customer?.fullName}</li>)}</ul>
          )}
        </Card>
        <Card title="Acciones pendientes">
          {!actions.data ? <Skeleton /> : pending.length === 0 ? <EmptyState title="Sin acciones pendientes" /> : (
            <ul className="plain">{pending.map((a) => <li key={a.id}>{a.title}{a.dueDate && <small> · vence {formatDate(a.dueDate)}</small>}</li>)}</ul>
          )}
        </Card>
        <Card title="Objetivos">
          {!goals.data ? <Skeleton /> : goals.data.length === 0 ? <EmptyState title="Sin objetivos" /> : (
            <ul className="plain">{goals.data.slice(0, 5).map((g) => <li key={g.id}>{g.title}: {formatNumber(g.currentValue)} / {formatNumber(g.targetValue)}</li>)}</ul>
          )}
        </Card>
      </div>
      <p><Link to="/dashboard">Ver dashboard completo →</Link></p>
    </>
  );
}
