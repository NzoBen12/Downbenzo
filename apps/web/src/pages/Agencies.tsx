import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Agency, Manager, Visit } from '../api/types';
import { Can, useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, Card, ConfirmDialog, DataTable, ErrorState, Input, MetricCard, Modal, Select, Skeleton, useToast } from '../components/ui';
import { VISIT_STATUS, formatDateTime } from '../lib/format';
import { useList, useListState } from '../lib/hooks';

const schema = z.object({
  code: z.string().trim().min(1, 'Obligatorio').max(20),
  name: z.string().trim().min(1, 'Obligatorio').max(120),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
});
type Form = z.infer<typeof schema>;

function AgencyForm({ agency, onClose }: { agency?: Agency; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: agency?.code ?? '', name: agency?.name ?? '', city: agency?.city ?? '', address: agency?.address ?? '', phone: agency?.phone ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: Form) => {
      const body = { ...v, city: v.city || null, address: v.address || null, phone: v.phone || null };
      return agency ? api.patch(`/agencies/${agency.id}`, body) : api.post('/agencies', body);
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Agencia guardada', 'success'); onClose(); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error al guardar', 'error'),
  });
  return (
    <Modal title={agency ? 'Editar agencia' : 'Nueva agencia'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="agency-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="agency-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Código" {...register('code')} error={errors.code?.message} />
        <Input label="Nombre" {...register('name')} error={errors.name?.message} />
        <Input label="Localidad" {...register('city')} error={errors.city?.message} />
        <Input label="Teléfono" {...register('phone')} error={errors.phone?.message} />
        <Input label="Dirección" {...register('address')} error={errors.address?.message} />
      </form>
    </Modal>
  );
}

export function AgenciesPage() {
  const ls = useListState(['isActive'], { sortBy: 'name', sortDir: 'asc' });
  const { data, isLoading, error, refetch } = useList<Agency>('agencies', '/agencies', ls.params);
  const [editing, setEditing] = useState<Agency | 'new' | null>(null);
  const [toggle, setToggle] = useState<Agency | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const setActive = useMutation({
    mutationFn: (a: Agency) => api.post(`/agencies/${a.id}/${a.isActive ? 'deactivate' : 'activate'}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['agencies'] }); setToggle(null); toast.show('Estado actualizado', 'success'); },
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Error', 'error'),
  });

  return (
    <>
      <PageHead title="Agencias" actions={<Can permission="agencies.create"><Button onClick={() => setEditing('new')}>Nueva agencia</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch} exportPath="/agencies/export" exportParams={ls.params}>
        <Select label="Estado" value={ls.filter('isActive')} onChange={(e) => ls.setFilter('isActive', e.target.value)} placeholder="Todos"><option value="true">Activas</option><option value="false">Inactivas</option></Select>
      </FilterBar>
      <DataTable<Agency> caption="Listado de agencias" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()}
        page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize} sortBy={ls.sortBy} sortDir={ls.sortDir} onSort={ls.toggleSort}
        columns={[
          { key: 'code', header: 'Código', sortable: true, render: (a) => a.code },
          { key: 'name', header: 'Nombre', sortable: true, render: (a) => <Link to={`/agencies/${a.id}`}>{a.name}</Link> },
          { key: 'city', header: 'Localidad', sortable: true, render: (a) => a.city ?? '—' },
          { key: 'managers', header: 'Gestores', render: (a) => a._count?.managers ?? 0 },
          { key: 'visits', header: 'Visitas', render: (a) => a._count?.visits ?? 0 },
          { key: 'isActive', header: 'Estado', render: (a) => <Badge tone={a.isActive ? 'ok' : 'neutral'}>{a.isActive ? 'Activa' : 'Inactiva'}</Badge> },
        ]}
        rowActions={(a) => (
          <Can permission="agencies.update">
            <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>Editar</Button>
            <Button size="sm" variant="secondary" onClick={() => setToggle(a)}>{a.isActive ? 'Desactivar' : 'Activar'}</Button>
          </Can>
        )} />
      {editing && <AgencyForm agency={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {toggle && <ConfirmDialog title={toggle.isActive ? 'Desactivar agencia' : 'Activar agencia'} message={`¿Confirma ${toggle.isActive ? 'desactivar' : 'activar'} “${toggle.name}”?`} danger={toggle.isActive} loading={setActive.isPending} onConfirm={() => setActive.mutate(toggle)} onCancel={() => setToggle(null)} />}
    </>
  );
}

interface AgencyDetail extends Agency {
  managers: Manager[];
  recentVisits: (Visit & { manager: { id: string; fullName: string } })[];
  metrics: { visitsByStatus: Record<string, number>; currencyOperations: number; currencyAmount: string };
}

export function AgencyDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['agency', id], queryFn: () => api.get<AgencyDetail>(`/agencies/${id}`) });
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={6} />;
  return (
    <>
      <PageHead title={data.name} crumbs={<Link to="/agencies">Agencias</Link>} actions={<Badge tone={data.isActive ? 'ok' : 'neutral'}>{data.isActive ? 'Activa' : 'Inactiva'}</Badge>} />
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {Object.entries(VISIT_STATUS).map(([k, v]) => <MetricCard key={k} label={`Visitas ${v.label.toLowerCase()}`} value={data.metrics.visitsByStatus[k] ?? 0} />)}
        <MetricCard label="Operaciones de divisa" value={data.metrics.currencyOperations} hint={`Importe ${data.metrics.currencyAmount}`} />
      </div>
      <div className="grid cols-2">
        <Card title="Información"><dl className="kv"><dt>Código</dt><dd>{data.code}</dd><dt>Localidad</dt><dd>{data.city ?? '—'}</dd><dt>Dirección</dt><dd>{data.address ?? '—'}</dd><dt>Teléfono</dt><dd>{data.phone ?? '—'}</dd><dt>Origen del dato</dt><dd>{data.origin}</dd></dl></Card>
        <Card title="Gestores asociados">
          {data.managers.length === 0 ? <p>Sin gestores.</p> : <ul className="plain">{data.managers.map((m) => <li key={m.id}>{can('managers.read') ? <Link to={`/managers/${m.id}`}>{m.fullName}</Link> : m.fullName}</li>)}</ul>}
        </Card>
        <Card title="Últimas visitas">
          <ul className="plain">{data.recentVisits.map((v) => <li key={v.id}><Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> · {v.manager.fullName} <Badge tone={VISIT_STATUS[v.status].tone}>{VISIT_STATUS[v.status].label}</Badge></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
