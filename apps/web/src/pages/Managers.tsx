import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Manager, Visit } from '../api/types';
import { Can } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, Card, DataTable, ErrorState, Input, MetricCard, Modal, Select, Skeleton, useToast } from '../components/ui';
import { VISIT_STATUS, formatDate, formatDateTime } from '../lib/format';
import { useAgencyOptions, useList, useListState } from '../lib/hooks';

const schema = z.object({
  code: z.string().trim().min(1, 'Obligatorio').max(20),
  fullName: z.string().trim().min(1, 'Obligatorio').max(120),
  email: z.string().trim().email('Correo inválido').or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  agencyId: z.string().min(1, 'Seleccione una agencia'),
});
type Form = z.infer<typeof schema>;

function ManagerForm({ manager, onClose }: { manager?: Manager; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const agencies = useAgencyOptions();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: manager?.code ?? '', fullName: manager?.fullName ?? '', email: manager?.email ?? '', phone: manager?.phone ?? '', agencyId: manager?.agencyId ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: Form) => {
      const body = { ...v, email: v.email || null, phone: v.phone || null };
      return manager ? api.patch(`/managers/${manager.id}`, body) : api.post('/managers', body);
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Gestor guardado', 'success'); onClose(); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error al guardar', 'error'),
  });
  return (
    <Modal title={manager ? 'Editar gestor' : 'Nuevo gestor'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="manager-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="manager-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Código" {...register('code')} error={errors.code?.message} />
        <Input label="Nombre completo" {...register('fullName')} error={errors.fullName?.message} />
        <Input label="Correo" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Teléfono" {...register('phone')} error={errors.phone?.message} />
        <Select label="Agencia" placeholder="Seleccione…" {...register('agencyId')} error={errors.agencyId?.message}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </form>
    </Modal>
  );
}

export function ManagersPage() {
  const ls = useListState(['agencyId', 'isActive'], { sortBy: 'fullName', sortDir: 'asc' });
  const { data, isLoading, error, refetch } = useList<Manager>('managers', '/managers', ls.params);
  const agencies = useAgencyOptions();
  const [editing, setEditing] = useState<Manager | 'new' | null>(null);
  return (
    <>
      <PageHead title="Gestores" actions={<Can permission="managers.create"><Button onClick={() => setEditing('new')}>Nuevo gestor</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch}>
        <Select label="Agencia" value={ls.filter('agencyId')} onChange={(e) => ls.setFilter('agencyId', e.target.value)} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Estado" value={ls.filter('isActive')} onChange={(e) => ls.setFilter('isActive', e.target.value)} placeholder="Todos"><option value="true">Activos</option><option value="false">Inactivos</option></Select>
      </FilterBar>
      <DataTable<Manager> caption="Listado de gestores" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()}
        page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize} sortBy={ls.sortBy} sortDir={ls.sortDir} onSort={ls.toggleSort}
        columns={[
          { key: 'code', header: 'Código', sortable: true, render: (m) => m.code },
          { key: 'fullName', header: 'Nombre', sortable: true, render: (m) => <Link to={`/managers/${m.id}`}>{m.fullName}</Link> },
          { key: 'agency', header: 'Agencia', render: (m) => m.agency?.name ?? '—' },
          { key: 'email', header: 'Correo', render: (m) => m.email ?? '—' },
          { key: 'isActive', header: 'Estado', render: (m) => <Badge tone={m.isActive ? 'ok' : 'neutral'}>{m.isActive ? 'Activo' : 'Inactivo'}</Badge> },
        ]}
        rowActions={(m) => <Can permission="managers.update"><Button size="sm" variant="secondary" onClick={() => setEditing(m)}>Editar</Button></Can>} />
      {editing && <ManagerForm manager={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface ManagerDetail extends Manager {
  metrics: { visitsByStatus: Record<string, number>; score: number };
  recentVisits: Visit[];
  goals: { id: string; title: string; targetValue: string; currentValue: string; periodEnd: string }[];
}

export function ManagerDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['manager', id], queryFn: () => api.get<ManagerDetail>(`/managers/${id}`) });
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={6} />;
  return (
    <>
      <PageHead title={data.fullName} crumbs={<Link to="/managers">Gestores</Link>} actions={<Badge tone={data.isActive ? 'ok' : 'neutral'}>{data.isActive ? 'Activo' : 'Inactivo'}</Badge>} />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <MetricCard label="Puntuación" value={`${data.metrics.score}%`} hint="Exitosas / visitas resueltas" />
        {Object.entries(VISIT_STATUS).map(([k, v]) => <MetricCard key={k} label={v.label} value={data.metrics.visitsByStatus[k] ?? 0} />)}
      </div>
      <div className="grid cols-2">
        <Card title="Información"><dl className="kv"><dt>Código</dt><dd>{data.code}</dd><dt>Agencia</dt><dd>{data.agency ? <Link to={`/agencies/${data.agency.id}`}>{data.agency.name}</Link> : '—'}</dd><dt>Correo</dt><dd>{data.email ?? '—'}</dd><dt>Teléfono</dt><dd>{data.phone ?? '—'}</dd></dl></Card>
        <Card title="Objetivos">{data.goals.length === 0 ? <p>Sin objetivos asignados.</p> : <ul className="plain">{data.goals.map((g) => <li key={g.id}>{g.title}: {g.currentValue}/{g.targetValue} (hasta {formatDate(g.periodEnd)})</li>)}</ul>}</Card>
        <Card title="Actividad reciente"><ul className="plain">{data.recentVisits.map((v) => <li key={v.id}><Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> <Badge tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Badge></li>)}</ul></Card>
      </div>
    </>
  );
}
