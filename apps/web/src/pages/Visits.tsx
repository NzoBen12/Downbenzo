import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Visit } from '../api/types';
import { Can, useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, Card, DataTable, DatePicker, ErrorState, Modal, Select, Skeleton, Textarea, useToast } from '../components/ui';
import { VISIT_STATUS, formatDateTime, fromLocalInput, toLocalInput } from '../lib/format';
import { useAgencyOptions, useCustomerOptions, useList, useListState, useManagerOptions, useProspectOptions } from '../lib/hooks';

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={VISIT_STATUS[status]?.tone}>{VISIT_STATUS[status]?.label ?? status}</Badge>;

const schema = z.object({
  scheduledAt: z.string().min(1, 'Indique fecha y hora'),
  agencyId: z.string().min(1, 'Seleccione una agencia'),
  managerId: z.string().min(1, 'Seleccione un gestor'),
  partyType: z.enum(['prospect', 'customer']),
  partyId: z.string().min(1, 'Seleccione un cliente o prospecto'),
  notes: z.string().max(2000).optional(),
});
type Form = z.infer<typeof schema>;

export function VisitForm({ visit, initialDate, onClose }: { visit?: Visit; initialDate?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const agencies = useAgencyOptions();
  const prospects = useProspectOptions();
  const customers = useCustomerOptions();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      scheduledAt: toLocalInput(visit?.scheduledAt ?? initialDate),
      agencyId: visit?.agencyId ?? user?.agencyId ?? '',
      managerId: visit?.managerId ?? user?.managerId ?? '',
      partyType: visit?.customerId ? 'customer' : 'prospect',
      partyId: visit?.prospectId ?? visit?.customerId ?? '',
      notes: visit?.notes ?? '',
    },
  });
  const agencyId = watch('agencyId');
  const partyType = watch('partyType');
  const managers = useManagerOptions(agencyId || undefined);

  const save = useMutation({
    mutationFn: (v: Form) => {
      const common = { scheduledAt: fromLocalInput(v.scheduledAt), agencyId: v.agencyId, managerId: v.managerId, notes: v.notes || null };
      if (visit) return api.patch(`/visits/${visit.id}`, common);
      return api.post('/visits', { ...common, ...(v.partyType === 'prospect' ? { prospectId: v.partyId } : { customerId: v.partyId }) });
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.show(visit ? 'Visita actualizada' : 'Visita creada', 'success'); onClose(); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error al guardar', 'error'),
  });

  return (
    <Modal title={visit ? 'Editar visita' : 'Nueva visita'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="visit-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="visit-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <DatePicker withTime label="Fecha y hora" {...register('scheduledAt')} error={errors.scheduledAt?.message} />
        <Select label="Agencia" placeholder="Seleccione…" {...register('agencyId', { onChange: () => setValue('managerId', '') })} error={errors.agencyId?.message}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" placeholder="Seleccione…" {...register('managerId')} error={errors.managerId?.message}>{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        {!visit && (
          <>
            <Select label="Tipo" {...register('partyType', { onChange: () => setValue('partyId', '') })}><option value="prospect">Prospecto (no-cliente)</option><option value="customer">Cliente</option></Select>
            <Select label={partyType === 'prospect' ? 'Prospecto' : 'Cliente'} placeholder="Seleccione…" {...register('partyId')} error={errors.partyId?.message}>
              {(partyType === 'prospect' ? prospects : customers).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </Select>
          </>
        )}
        <div style={{ gridColumn: '1 / -1' }}><Textarea label="Observaciones" {...register('notes')} error={errors.notes?.message} /></div>
      </form>
    </Modal>
  );
}

type Action = 'SUCCESSFUL' | 'UNSUCCESSFUL' | 'DEFERRED' | 'PLANNED' | 'CANCELLED';
const ACTION_LABEL: Record<Action, string> = { SUCCESSFUL: 'Marcar realizada', UNSUCCESSFUL: 'Marcar sin éxito', DEFERRED: 'Diferir', PLANNED: 'Reprogramar', CANCELLED: 'Anular' };
const ALLOWED: Record<string, Action[]> = {
  PLANNED: ['SUCCESSFUL', 'UNSUCCESSFUL', 'DEFERRED', 'CANCELLED'],
  DEFERRED: ['PLANNED', 'SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED'],
};

export function VisitStatusDialog({ visit, action, onClose }: { visit: Visit; action: Action; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [result, setResult] = useState('');
  const [date, setDate] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post(`/visits/${visit.id}/status`, { status: action, result: result || null, ...(action === 'PLANNED' ? { newScheduledAt: fromLocalInput(date) } : {}) }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Estado actualizado', 'success'); onClose(); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error', 'error'),
  });
  return (
    <Modal title={ACTION_LABEL[action]} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={action === 'CANCELLED' ? 'danger' : 'primary'} loading={mutation.isPending} disabled={action === 'PLANNED' && !date} onClick={() => mutation.mutate()}>Confirmar</Button></>}>
      <div className="form-grid">
        {action === 'PLANNED' && <DatePicker withTime label="Nueva fecha y hora" value={date} onChange={(e) => setDate(e.target.value)} />}
        <div style={{ gridColumn: '1 / -1' }}><Textarea label="Resultado / motivo" value={result} onChange={(e) => setResult(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

export function VisitsPage() {
  const ls = useListState(['status', 'agencyId', 'managerId', 'from', 'to'], { sortBy: 'scheduledAt', sortDir: 'desc' });
  const { data, isLoading, error, refetch } = useList<Visit>('visits', '/visits', ls.params);
  const agencies = useAgencyOptions();
  const managers = useManagerOptions(ls.filter('agencyId') || undefined);
  const [editing, setEditing] = useState<Visit | 'new' | null>(null);
  return (
    <>
      <PageHead title="Gestión de visitas" actions={<Can permission="visits.create"><Button onClick={() => setEditing('new')}>Nueva visita</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch} exportPath="/visits/export" exportParams={ls.params}>
        <Select label="Estado" value={ls.filter('status')} onChange={(e) => ls.setFilter('status', e.target.value)} placeholder="Todos">{Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select label="Agencia" value={ls.filter('agencyId')} onChange={(e) => ls.setFilter('agencyId', e.target.value)} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" value={ls.filter('managerId')} onChange={(e) => ls.setFilter('managerId', e.target.value)} placeholder="Todos">{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        <DatePicker label="Desde" value={ls.filter('from').slice(0, 10)} onChange={(e) => ls.setFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')} />
        <DatePicker label="Hasta" value={ls.filter('to').slice(0, 10)} onChange={(e) => ls.setFilter('to', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '')} />
      </FilterBar>
      <DataTable<Visit> caption="Listado de visitas" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()}
        page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize} sortBy={ls.sortBy} sortDir={ls.sortDir} onSort={ls.toggleSort}
        columns={[
          { key: 'scheduledAt', header: 'Fecha', sortable: true, render: (v) => <Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> },
          { key: 'status', header: 'Estado', sortable: true, render: (v) => <StatusBadge status={v.status} /> },
          { key: 'agency', header: 'Agencia', render: (v) => v.agency.name },
          { key: 'manager', header: 'Gestor', render: (v) => v.manager.fullName },
          { key: 'party', header: 'Cliente / prospecto', render: (v) => v.prospect?.fullName ?? v.customer?.fullName ?? '—' },
        ]}
        rowActions={(v) => <Can permission="visits.update">{ALLOWED[v.status] && <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>Editar</Button>}</Can>} />
      {editing && <VisitForm visit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface VisitDetail extends Visit {
  sales: { id: string; sold: boolean; amount: string; product: { name: string } }[];
  history: { id: string; action: string; createdAt: string; result: string; user: { fullName: string } | null }[];
}

export function VisitDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['visit', id], queryFn: () => api.get<VisitDetail>(`/visits/${id}`) });
  const [action, setAction] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={6} />;
  const actions = ALLOWED[data.status] ?? [];
  return (
    <>
      <PageHead title={`Visita · ${formatDateTime(data.scheduledAt)}`} crumbs={<Link to="/visits">Visitas</Link>}
        actions={<><StatusBadge status={data.status} />
          <Can permission="visits.update">{actions.length > 0 && <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>}{actions.map((a) => <Button key={a} variant={a === 'CANCELLED' ? 'danger' : 'secondary'} onClick={() => setAction(a)}>{ACTION_LABEL[a]}</Button>)}</Can></>} />
      <div className="grid cols-2">
        <Card title="Información"><dl className="kv">
          <dt>Agencia</dt><dd><Link to={`/agencies/${data.agency.id}`}>{data.agency.name}</Link></dd>
          <dt>Gestor</dt><dd><Link to={`/managers/${data.manager.id}`}>{data.manager.fullName}</Link></dd>
          <dt>{data.prospect ? 'Prospecto' : 'Cliente'}</dt><dd>{data.prospect ? <Link to={`/prospects/${data.prospect.id}`}>{data.prospect.fullName}</Link> : data.customer?.fullName}</dd>
          <dt>Resultado</dt><dd>{data.result ?? '—'}</dd><dt>Observaciones</dt><dd>{data.notes ?? '—'}</dd></dl></Card>
        <Card title="Productos"><ul className="plain">{data.sales.length === 0 ? <li>Sin productos registrados.</li> : data.sales.map((s) => <li key={s.id}>{s.product.name} · {s.sold ? `vendido (${s.amount})` : 'no vendido'}</li>)}</ul></Card>
        <Card title="Historial"><ul className="plain">{data.history.map((h) => <li key={h.id}>{formatDateTime(h.createdAt)} · {h.action} · {h.user?.fullName ?? 'sistema'}</li>)}</ul></Card>
      </div>
      {action && <VisitStatusDialog visit={data} action={action} onClose={() => setAction(null)} />}
      {editing && <VisitForm visit={data} onClose={() => setEditing(false)} />}
    </>
  );
}
