import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, Params } from '../api/client';
import { DashboardData } from '../api/types';
import { ExportMenu, PageHead } from '../components/FilterBar';
import { BarList, Button, Card, DatePicker, ErrorState, LineChart, MetricCard, Select, Skeleton } from '../components/ui';
import { VISIT_STATUS, formatDateTime, formatNumber } from '../lib/format';
import { useAgencyOptions, useManagerOptions } from '../lib/hooks';

export function DashboardPage() {
  const [f, setF] = useState({ from: '', to: '', agencyId: '', managerId: '', status: '' });
  const agencies = useAgencyOptions();
  const managers = useManagerOptions(f.agencyId || undefined);
  const params: Params = {
    from: f.from ? new Date(f.from).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined,
    agencyId: f.agencyId, managerId: f.managerId, status: f.status,
  };
  const { data, error, isLoading, isFetching, refetch } = useQuery({ queryKey: ['dashboard', params], queryFn: () => api.get<DashboardData>('/dashboard', params) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value, ...(k === 'agencyId' ? { managerId: '' } : {}) }));

  return (
    <>
      <PageHead title="Dashboard" actions={<><Button variant="secondary" onClick={() => void refetch()} loading={isFetching && !isLoading}>Actualizar</Button><ExportMenu path="/reports/activity" params={params} /></>} />
      <div className="filters">
        <DatePicker label="Desde" value={f.from} onChange={set('from')} />
        <DatePicker label="Hasta" value={f.to} onChange={set('to')} />
        <Select label="Agencia" value={f.agencyId} onChange={set('agencyId')} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" value={f.managerId} onChange={set('managerId')} placeholder="Todos">{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        <Select label="Estado de visita" value={f.status} onChange={set('status')} placeholder="Todos">{Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </div>
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading || !data ? <Skeleton lines={5} /> : (
        <div className="grid" aria-busy={isFetching}>
          <div className="grid cols-4">
            <MetricCard label="Total visitas" value={formatNumber(data.visits.total)} hint={`Tasa de éxito ${data.visits.successRate}%`} />
            <MetricCard label="Visitas exitosas" value={formatNumber(data.visits.successful)} />
            <MetricCard label="Visitas anuladas" value={formatNumber(data.visits.cancelled)} />
            <MetricCard label="Visitas sin éxito" value={formatNumber(data.visits.unsuccessful)} />
            <MetricCard label="Visitas diferidas" value={formatNumber(data.visits.deferred)} />
            <MetricCard label="Visitas planificadas" value={formatNumber(data.visits.planned)} />
          </div>
          <div className="grid cols-4">
            <MetricCard label="Productos vendidos" value={formatNumber(data.products.sold)} />
            <MetricCard label="Productos no vendidos" value={formatNumber(data.products.notSold)} />
            <MetricCard label="Productos DELTA" value={formatNumber(data.products.delta)} />
            <MetricCard label="Importe total productos" value={formatNumber(data.products.totalAmount)} />
            <MetricCard label="Operaciones de divisa" value={formatNumber(data.currency.operations)} />
          </div>
          <Card title="Tendencia de visitas"><LineChart points={data.trend} label="Visitas por día, total y exitosas" /></Card>
          <div className="grid cols-2">
            <Card title="Ranking de gestores"><BarList label="Visitas exitosas por gestor" items={data.rankings.managers.map((r) => ({ label: `${r.name} (${r.score}%)`, value: r.successful }))} /></Card>
            <Card title="Ranking de agencias"><BarList label="Visitas exitosas por agencia" items={data.rankings.agencies.map((r) => ({ label: `${r.name} (${r.score}%)`, value: r.successful }))} /></Card>
            <Card title="Cambio de divisa por moneda"><BarList label="Importe por moneda" items={data.currency.byCurrency.map((c) => ({ label: `${c.currency} (${c.operations} op.)`, value: Number(c.amount) }))} /></Card>
          </div>
          <small style={{ color: 'var(--c-muted)' }}>Datos calculados en el servidor · {formatDateTime(data.generatedAt)}</small>
        </div>
      )}
    </>
  );
}
