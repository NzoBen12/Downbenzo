import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Prospect, Visit } from '../api/types';
import { Can } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, Card, DataTable, ErrorState, Input, Modal, Select, Skeleton, Textarea, useToast } from '../components/ui';
import { PROSPECT_STATUS, formatDateTime } from '../lib/format';
import { useList, useListState } from '../lib/hooks';
import { StatusBadge, VisitForm } from './Visits';

const schema = z.object({
  fullName: z.string().trim().min(1, 'Obligatorio').max(120),
  email: z.string().trim().email('Correo inválido').or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  city: z.string().trim().max(80).optional(),
  interests: z.string().max(300).optional(),
  status: z.enum(['NEW', 'IN_FOLLOW_UP', 'CONVERTED', 'LOST']),
  notes: z.string().max(2000).optional(),
});
type Form = z.infer<typeof schema>;

function ProspectForm({ prospect, onClose }: { prospect?: Prospect; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: prospect?.fullName ?? '', email: prospect?.email ?? '', phone: prospect?.phone ?? '', city: prospect?.city ?? '', interests: prospect?.interests.join(', ') ?? '', status: (prospect?.status as Form['status']) ?? 'NEW', notes: prospect?.notes ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: Form) => {
      const body = { ...v, email: v.email || null, phone: v.phone || null, city: v.city || null, notes: v.notes || null, interests: (v.interests ?? '').split(',').map((s) => s.trim()).filter(Boolean) };
      return prospect ? api.patch(`/prospects/${prospect.id}`, body) : api.post('/prospects', body);
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Prospecto guardado', 'success'); onClose(); },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Error al guardar', 'error'),
  });
  return (
    <Modal title={prospect ? 'Editar prospecto' : 'Nuevo prospecto'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="prospect-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="prospect-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Nombre completo" {...register('fullName')} error={errors.fullName?.message} />
        <Input label="Correo" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Teléfono" {...register('phone')} error={errors.phone?.message} />
        <Input label="Localidad" {...register('city')} error={errors.city?.message} />
        <Input label="Intereses" help="Separados por comas" {...register('interests')} error={errors.interests?.message} />
        <Select label="Estado" {...register('status')}>{Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <div style={{ gridColumn: '1 / -1' }}><Textarea label="Notas de seguimiento" {...register('notes')} error={errors.notes?.message} /></div>
      </form>
    </Modal>
  );
}

const tone = (s: string) => (s === 'CONVERTED' ? 'ok' : s === 'LOST' ? 'danger' : s === 'IN_FOLLOW_UP' ? 'info' : 'neutral') as 'ok' | 'danger' | 'info' | 'neutral';

export function ProspectsPage() {
  const ls = useListState(['status', 'city'], { sortBy: 'createdAt', sortDir: 'desc' });
  const { data, isLoading, error, refetch } = useList<Prospect>('prospects', '/prospects', ls.params);
  const [editing, setEditing] = useState<Prospect | 'new' | null>(null);
  return (
    <>
      <PageHead title="No-clientes / Prospectos" actions={<Can permission="prospects.create"><Button onClick={() => setEditing('new')}>Nuevo prospecto</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch}>
        <Select label="Estado" value={ls.filter('status')} onChange={(e) => ls.setFilter('status', e.target.value)} placeholder="Todos">{Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Input label="Localidad" value={ls.filter('city')} onChange={(e) => ls.setFilter('city', e.target.value)} />
      </FilterBar>
      <DataTable<Prospect> caption="Listado de prospectos" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()}
        page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize} sortBy={ls.sortBy} sortDir={ls.sortDir} onSort={ls.toggleSort}
        columns={[
          { key: 'fullName', header: 'Nombre', sortable: true, render: (p) => <Link to={`/prospects/${p.id}`}>{p.fullName}</Link> },
          { key: 'city', header: 'Localidad', sortable: true, render: (p) => p.city ?? '—' },
          { key: 'interests', header: 'Intereses', render: (p) => p.interests.join(', ') || '—' },
          { key: 'status', header: 'Estado', sortable: true, render: (p) => <Badge tone={tone(p.status)}>{PROSPECT_STATUS[p.status]}</Badge> },
          { key: 'visits', header: 'Visitas', render: (p) => p._count?.visits ?? 0 },
        ]}
        rowActions={(p) => <Can permission="prospects.update"><Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Editar</Button></Can>} />
      {editing && <ProspectForm prospect={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function ProspectDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['prospect', id], queryFn: () => api.get<Prospect & { visits: Visit[] }>(`/prospects/${id}`) });
  const [editing, setEditing] = useState(false);
  const [newVisit, setNewVisit] = useState(false);
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={6} />;
  return (
    <>
      <PageHead title={data.fullName} crumbs={<Link to="/prospects">No-clientes</Link>}
        actions={<><Badge tone={tone(data.status)}>{PROSPECT_STATUS[data.status]}</Badge><Can permission="prospects.update"><Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button></Can><Can permission="visits.create"><Button onClick={() => setNewVisit(true)}>Programar visita</Button></Can></>} />
      <div className="grid cols-2">
        <Card title="Ficha"><dl className="kv"><dt>Correo</dt><dd>{data.email ?? '—'}</dd><dt>Teléfono</dt><dd>{data.phone ?? '—'}</dd><dt>Localidad</dt><dd>{data.city ?? '—'}</dd><dt>Intereses</dt><dd>{data.interests.join(', ') || '—'}</dd><dt>Notas</dt><dd>{data.notes ?? '—'}</dd></dl></Card>
        <Card title="Historial de visitas"><ul className="plain">{data.visits.length === 0 ? <li>Sin visitas.</li> : data.visits.map((v) => <li key={v.id}><Link to={`/visits/${v.id}`}>{formatDateTime(v.scheduledAt)}</Link> · {v.manager.fullName} <StatusBadge status={v.status} /></li>)}</ul></Card>
      </div>
      {editing && <ProspectForm prospect={data} onClose={() => setEditing(false)} />}
      {newVisit && <VisitForm onClose={() => setNewVisit(false)} />}
    </>
  );
}
