import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Card as CardT, CardMovement, CurrencyOperation, Lot } from '../api/types';
import { Can } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, BarList, Button, Card, DataTable, DatePicker, ErrorState, Input, MetricCard, Modal, Select, Skeleton, Tabs, useToast } from '../components/ui';
import { CARD_MOVEMENT, CARD_STATUS, CURRENCY_STATUS, LOT_STATUS, formatDateTime, formatNumber, fromLocalInput } from '../lib/format';
import { useAgencyOptions, useList, useListState } from '../lib/hooks';

const err = (e: unknown) => (e instanceof ApiError ? e.message : 'Error inesperado');

/* ───────────── Divisas ───────────── */
const opSchema = z.object({
  operatedAt: z.string().min(1, 'Indique la fecha'),
  currency: z.string().trim().length(3, 'Código ISO de 3 letras'),
  amount: z.coerce.number().positive('Debe ser mayor que 0'),
  rate: z.union([z.coerce.number().positive(), z.literal('')]).optional(),
  agencyId: z.string().min(1, 'Seleccione una agencia'),
});
type OpForm = z.input<typeof opSchema>;

function CurrencyForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const agencies = useAgencyOptions();
  const { register, handleSubmit, formState: { errors } } = useForm<OpForm>({ resolver: zodResolver(opSchema), defaultValues: { currency: 'USD' } });
  const save = useMutation({
    mutationFn: (v: OpForm) => api.post('/currency-operations', { ...v, operatedAt: fromLocalInput(v.operatedAt), currency: v.currency.toUpperCase(), rate: v.rate === '' || v.rate === undefined ? null : Number(v.rate) }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Operación registrada', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title="Nueva operación de cambio" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="op-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="op-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <DatePicker withTime label="Fecha" {...register('operatedAt')} error={errors.operatedAt?.message} />
        <Input label="Moneda (ISO)" maxLength={3} {...register('currency')} error={errors.currency?.message} />
        <Input label="Importe" type="number" step="0.01" {...register('amount')} error={errors.amount?.message} />
        <Input label="Tipo de cambio" type="number" step="0.000001" {...register('rate')} error={errors.rate?.message} />
        <Select label="Agencia" placeholder="Seleccione…" {...register('agencyId')} error={errors.agencyId?.message}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </form>
    </Modal>
  );
}

export function CurrencyPage() {
  const ls = useListState(['currency', 'status', 'agencyId'], { sortDir: 'desc' });
  const { data, isLoading, error, refetch } = useList<CurrencyOperation>('currency', '/currency-operations', ls.params);
  const agencies = useAgencyOptions();
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.patch(`/currency-operations/${v.id}`, { status: v.status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['currency'] }); toast.show('Estado actualizado', 'success'); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  const stats = (data as unknown as { stats?: { currency: string; operations: number; amount: string }[] })?.stats ?? [];
  return (
    <>
      <PageHead title="Cambio de divisa" actions={<Can permission="currency.create"><Button onClick={() => setCreating(true)}>Nueva operación</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch} exportPath="/currency-operations/export" exportParams={ls.params}>
        <Input label="Moneda" maxLength={3} value={ls.filter('currency')} onChange={(e) => ls.setFilter('currency', e.target.value.toUpperCase())} />
        <Select label="Estado" value={ls.filter('status')} onChange={(e) => ls.setFilter('status', e.target.value)} placeholder="Todos">{Object.entries(CURRENCY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select label="Agencia" value={ls.filter('agencyId')} onChange={(e) => ls.setFilter('agencyId', e.target.value)} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </FilterBar>
      {stats.length > 0 && <div style={{ marginBottom: 16 }}><Card title="Importe por moneda (filtros activos)"><BarList label="Importe por moneda" items={stats.map((s) => ({ label: `${s.currency} (${s.operations})`, value: Number(s.amount) }))} /></Card></div>}
      <DataTable<CurrencyOperation> caption="Operaciones de cambio de divisa" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()}
        page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
        columns={[
          { key: 'operatedAt', header: 'Fecha', render: (o) => formatDateTime(o.operatedAt) },
          { key: 'agency', header: 'Agencia', render: (o) => o.agency.name },
          { key: 'currency', header: 'Moneda', render: (o) => o.currency },
          { key: 'amount', header: 'Importe', render: (o) => formatNumber(o.amount) },
          { key: 'rate', header: 'Cambio', render: (o) => formatNumber(o.rate) },
          { key: 'status', header: 'Estado', render: (o) => <Badge tone={o.status === 'COMPLETED' ? 'ok' : o.status === 'CANCELLED' ? 'neutral' : 'warn'}>{CURRENCY_STATUS[o.status]}</Badge> },
        ]}
        rowActions={(o) => o.status === 'PENDING' ? <Can permission="currency.update"><Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: o.id, status: 'COMPLETED' })}>Completar</Button><Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: o.id, status: 'CANCELLED' })}>Cancelar</Button></Can> : null} />
      {creating && <CurrencyForm onClose={() => setCreating(false)} />}
    </>
  );
}

/* ───────────── Lotes ───────────── */
const lotSchema = z.object({ code: z.string().trim().min(1, 'Obligatorio').max(30), quantity: z.coerce.number().int().min(1, 'Mínimo 1'), agencyId: z.string().min(1, 'Seleccione una agencia'), notes: z.string().max(500).optional() });
type LotForm = z.input<typeof lotSchema>;
const LOT_NEXT: Record<string, string[]> = { CREATED: ['IN_TRANSIT', 'CANCELLED'], IN_TRANSIT: ['DELIVERED', 'CANCELLED'] };

function LotFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const agencies = useAgencyOptions();
  const { register, handleSubmit, formState: { errors } } = useForm<LotForm>({ resolver: zodResolver(lotSchema) });
  const save = useMutation({
    mutationFn: (v: LotForm) => api.post('/lots', { ...v, notes: v.notes || null }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Lote creado', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title="Nuevo lote" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="lot-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="lot-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Código" {...register('code')} error={errors.code?.message} />
        <Input label="Cantidad" type="number" {...register('quantity')} error={errors.quantity?.message} />
        <Select label="Agencia destino" placeholder="Seleccione…" {...register('agencyId')} error={errors.agencyId?.message}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Input label="Notas" {...register('notes')} error={errors.notes?.message} />
      </form>
    </Modal>
  );
}

function useLotStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { id: string; status: string }) => api.post(`/lots/${v.id}/status`, { status: v.status }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Lote actualizado', 'success'); },
    onError: (e) => toast.show(err(e), 'error'),
  });
}

export function LotsPage() {
  const ls = useListState(['status', 'agencyId']);
  const { data, isLoading, error, refetch } = useList<Lot>('lots', '/lots', ls.params);
  const agencies = useAgencyOptions();
  const [creating, setCreating] = useState(false);
  const setStatus = useLotStatus();
  return (
    <>
      <PageHead title="Lotes" actions={<Can permission="lots.create"><Button onClick={() => setCreating(true)}>Nuevo lote</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch}>
        <Select label="Estado" value={ls.filter('status')} onChange={(e) => ls.setFilter('status', e.target.value)} placeholder="Todos">{Object.entries(LOT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select label="Agencia destino" value={ls.filter('agencyId')} onChange={(e) => ls.setFilter('agencyId', e.target.value)} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </FilterBar>
      <DataTable<Lot> caption="Listado de lotes" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
        columns={[
          { key: 'code', header: 'Código', render: (l) => <Link to={`/lots/${l.id}`}>{l.code}</Link> },
          { key: 'agency', header: 'Agencia destino', render: (l) => l.agency.name },
          { key: 'quantity', header: 'Cantidad', render: (l) => l.quantity },
          { key: 'cards', header: 'Tarjetas', render: (l) => l._count?.cards ?? 0 },
          { key: 'status', header: 'Estado', render: (l) => <Badge tone={l.status === 'DELIVERED' ? 'ok' : l.status === 'CANCELLED' ? 'neutral' : 'info'}>{LOT_STATUS[l.status]}</Badge> },
        ]}
        rowActions={(l) => <Can permission="lots.update">{(LOT_NEXT[l.status] ?? []).map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: l.id, status: s })}>{LOT_STATUS[s]}</Button>)}</Can>} />
      {creating && <LotFormModal onClose={() => setCreating(false)} />}
    </>
  );
}

export function LotDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['lot', id], queryFn: () => api.get<Lot & { notes: string | null; cards: CardT[]; history: { id: string; action: string; createdAt: string }[] }>(`/lots/${id}`) });
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={6} />;
  return (
    <>
      <PageHead title={`Lote ${data.code}`} crumbs={<Link to="/lots">Lotes</Link>} actions={<Badge>{LOT_STATUS[data.status]}</Badge>} />
      <div className="grid cols-2">
        <Card title="Información"><dl className="kv"><dt>Agencia destino</dt><dd>{data.agency.name}</dd><dt>Cantidad</dt><dd>{data.quantity}</dd><dt>Notas</dt><dd>{data.notes ?? '—'}</dd></dl></Card>
        <Card title="Trazabilidad"><ul className="plain">{data.history.map((h) => <li key={h.id}>{formatDateTime(h.createdAt)} · {h.action}</li>)}</ul></Card>
        <Card title="Tarjetas del lote"><ul className="plain">{data.cards.map((c) => <li key={c.id}><Link to={`/cards/${c.id}`}>{c.reference}</Link> · {c.maskedPan} · {CARD_STATUS[c.status]}</li>)}</ul></Card>
      </div>
    </>
  );
}

/* ───────────── Tarjetas ───────────── */
type CardTab = 'distribution' | 'cards' | 'movements';
const cardSchema = z.object({ maskedPan: z.string().trim().regex(/^\d{4}[ -]?[*Xx]{4}[ -]?[*Xx]{4}[ -]?\d{4}$/, 'Use PAN enmascarado: 4111 **** **** 1111'), reference: z.string().trim().min(1, 'Obligatorio').max(40) });
type CardForm = z.infer<typeof cardSchema>;

function CardFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<CardForm>({ resolver: zodResolver(cardSchema) });
  const save = useMutation({ mutationFn: (v: CardForm) => api.post('/cards', v), onSuccess: () => { void qc.invalidateQueries(); toast.show('Tarjeta registrada', 'success'); onClose(); }, onError: (e) => toast.show(err(e), 'error') });
  return (
    <Modal title="Nueva tarjeta" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="card-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="card-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Referencia" {...register('reference')} error={errors.reference?.message} />
        <Input label="PAN enmascarado" help="Nunca introduzca el número completo" {...register('maskedPan')} error={errors.maskedPan?.message} />
      </form>
    </Modal>
  );
}

function MovementDialog({ card, onClose }: { card: CardT; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const agencies = useAgencyOptions();
  const [type, setType] = useState('DISTRIBUTION');
  const [agencyId, setAgencyId] = useState('');
  const save = useMutation({ mutationFn: () => api.post(`/cards/${card.id}/movements`, { type, ...(agencyId ? { agencyId } : {}) }), onSuccess: () => { void qc.invalidateQueries(); toast.show('Movimiento registrado', 'success'); onClose(); }, onError: (e) => toast.show(err(e), 'error') });
  return (
    <Modal title={`Movimiento · ${card.reference}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Registrar</Button></>}>
      <div className="form-grid">
        <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(CARD_MOVEMENT).filter(([k]) => k !== 'ENTRY').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {type === 'DISTRIBUTION' && <Select label="Agencia destino" placeholder="Seleccione…" value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
      </div>
    </Modal>
  );
}

export function CardsPage() {
  const [tab, setTab] = useState<CardTab>('distribution');
  const ls = useListState(['status', 'agencyId']);
  const cards = useList<CardT>('cards', '/cards', ls.params);
  const movements = useList<CardMovement>('card-movements', '/cards/movements', { page: ls.page, pageSize: ls.pageSize });
  const dist = useQuery({ queryKey: ['card-distribution'], queryFn: () => api.get<{ agencyId: string | null; agency: string; byStatus: Record<string, number> }[]>('/cards/distribution') });
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<CardT | null>(null);
  return (
    <>
      <PageHead title="Tarjetas" actions={<Can permission="cards.create"><Button onClick={() => setCreating(true)}>Nueva tarjeta</Button></Can>} />
      <Tabs label="Submódulos de tarjetas" value={tab} onChange={setTab} tabs={[{ id: 'distribution', label: 'Distribución' }, { id: 'cards', label: 'Tarjetas' }, { id: 'movements', label: 'Movimientos' }]} />
      {tab === 'distribution' && (dist.error ? <ErrorState error={dist.error} onRetry={() => void dist.refetch()} /> : !dist.data ? <Skeleton lines={4} /> : (
        <div className="grid cols-3">{dist.data.map((d) => <Card key={d.agencyId ?? 'none'} title={d.agency}><dl className="kv">{Object.entries(d.byStatus).map(([s, n]) => <><dt key={`${s}t`}>{CARD_STATUS[s]}</dt><dd key={`${s}d`}>{n}</dd></>)}</dl></Card>)}{dist.data.length === 0 && <MetricCard label="Tarjetas" value={0} />}</div>
      ))}
      {tab === 'cards' && (
        <>
          <FilterBar search={ls.search} onSearch={ls.setSearch}><Select label="Estado" value={ls.filter('status')} onChange={(e) => ls.setFilter('status', e.target.value)} placeholder="Todos">{Object.entries(CARD_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FilterBar>
          <DataTable<CardT> caption="Listado de tarjetas" result={cards.data} isLoading={cards.isLoading} error={cards.error} onRetry={() => void cards.refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
            columns={[
              { key: 'reference', header: 'Referencia', render: (c) => <Link to={`/cards/${c.id}`}>{c.reference}</Link> },
              { key: 'pan', header: 'PAN', render: (c) => c.maskedPan },
              { key: 'lot', header: 'Lote', render: (c) => c.lot?.code ?? '—' },
              { key: 'agency', header: 'Agencia', render: (c) => c.agency?.name ?? '—' },
              { key: 'status', header: 'Estado', render: (c) => <Badge tone={c.status === 'ACTIVE' ? 'ok' : c.status === 'BLOCKED' || c.status === 'CANCELLED' ? 'danger' : 'info'}>{CARD_STATUS[c.status]}</Badge> },
            ]}
            rowActions={(c) => <Can permission="cards.update"><Button size="sm" variant="secondary" onClick={() => setMoving(c)}>Movimiento</Button></Can>} />
        </>
      )}
      {tab === 'movements' && (
        <DataTable<CardMovement> caption="Movimientos de tarjetas" result={movements.data} isLoading={movements.isLoading} error={movements.error} onRetry={() => void movements.refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
          columns={[
            { key: 'at', header: 'Fecha', render: (m) => formatDateTime(m.occurredAt) },
            { key: 'card', header: 'Tarjeta', render: (m) => <Link to={`/cards/${m.card.id}`}>{m.card.reference}</Link> },
            { key: 'type', header: 'Movimiento', render: (m) => CARD_MOVEMENT[m.type] },
            { key: 'note', header: 'Nota', render: (m) => m.note ?? '—' },
          ]} />
      )}
      <p style={{ color: 'var(--c-muted)', marginTop: 12 }}>Integración con el sistema corporativo de tarjetas: pendiente. Sólo se almacena el PAN enmascarado.</p>
      {creating && <CardFormModal onClose={() => setCreating(false)} />}
      {moving && <MovementDialog card={moving} onClose={() => setMoving(null)} />}
    </>
  );
}

export function CardDetailPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['card', id], queryFn: () => api.get<CardT & { movements: { id: string; type: string; occurredAt: string; note: string | null }[] }>(`/cards/${id}`) });
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton lines={5} />;
  return (
    <>
      <PageHead title={`Tarjeta ${data.reference}`} crumbs={<Link to="/cards">Tarjetas</Link>} actions={<Badge>{CARD_STATUS[data.status]}</Badge>} />
      <div className="grid cols-2">
        <Card title="Información"><dl className="kv"><dt>PAN</dt><dd>{data.maskedPan}</dd><dt>Lote</dt><dd>{data.lot ? <Link to={`/lots/${data.lot.id}`}>{data.lot.code}</Link> : '—'}</dd><dt>Agencia</dt><dd>{data.agency?.name ?? '—'}</dd></dl></Card>
        <Card title="Movimientos"><ul className="plain">{data.movements.map((m) => <li key={m.id}>{formatDateTime(m.occurredAt)} · {CARD_MOVEMENT[m.type]}{m.note ? ` · ${m.note}` : ''}</li>)}</ul></Card>
      </div>
    </>
  );
}
