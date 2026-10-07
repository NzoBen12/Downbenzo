import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { Customer, Paginated, Product } from '../api/types';
import { Can, useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, DataTable, DatePicker, ErrorState, Input, Modal, Select, Skeleton, Tabs, useToast } from '../components/ui';
import { formatDateTime, formatNumber, fromLocalInput } from '../lib/format';
import { useAgencyOptions, useList, useListState, useManagerOptions, useProductOptions } from '../lib/hooks';

const err = (e: unknown) => (e instanceof ApiError ? e.message : 'Error inesperado');

interface Sale {
  id: string; sold: boolean; amount: string; soldAt: string;
  product: Product; agency: { id: string; name: string }; manager: { id: string; fullName: string };
}

/* ───────────── Ventas ───────────── */
const saleSchema = z.object({
  productId: z.string().min(1, 'Seleccione un producto'),
  agencyId: z.string().min(1, 'Seleccione una agencia'),
  managerId: z.string().min(1, 'Seleccione un gestor'),
  soldAt: z.string().min(1, 'Indique la fecha'),
  sold: z.boolean(),
  amount: z.coerce.number().min(0, 'No puede ser negativo'),
});
type SaleForm = z.input<typeof saleSchema>;

function SaleFormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const products = useProductOptions().filter((p) => p.isActive);
  const agencies = useAgencyOptions();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SaleForm>({
    resolver: zodResolver(saleSchema),
    defaultValues: { sold: true, amount: 0, agencyId: user?.agencyId ?? '', managerId: user?.managerId ?? '' },
  });
  const managers = useManagerOptions(watch('agencyId') || undefined);
  const save = useMutation({
    mutationFn: (v: SaleForm) => api.post('/sales', { ...v, soldAt: fromLocalInput(v.soldAt), amount: v.sold ? Number(v.amount) : 0 }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Venta registrada', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title="Registrar venta de producto" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="sale-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="sale-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Select label="Producto" placeholder="Seleccione…" {...register('productId')} error={errors.productId?.message}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isDelta ? ' (DELTA)' : ''}</option>)}</Select>
        <DatePicker withTime label="Fecha" {...register('soldAt')} error={errors.soldAt?.message} />
        <Select label="Agencia" placeholder="Seleccione…" {...register('agencyId', { onChange: () => setValue('managerId', '') })} error={errors.agencyId?.message}>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Select label="Gestor" placeholder="Seleccione…" {...register('managerId')} error={errors.managerId?.message}>{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        <Select label="Resultado" {...register('sold', { setValueAs: (v) => v === 'true' || v === true })}><option value="true">Vendido</option><option value="false">No vendido</option></Select>
        <Input label="Importe" type="number" step="0.01" {...register('amount')} error={errors.amount?.message} />
      </form>
    </Modal>
  );
}

/* ───────────── Catálogo ───────────── */
const productSchema = z.object({ code: z.string().trim().min(1, 'Obligatorio').max(30), name: z.string().trim().min(1, 'Obligatorio').max(120), isDelta: z.boolean(), isActive: z.boolean() });
type ProductForm = z.infer<typeof productSchema>;

function ProductFormModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { code: product?.code ?? '', name: product?.name ?? '', isDelta: product?.isDelta ?? false, isActive: product?.isActive ?? true },
  });
  const save = useMutation({
    mutationFn: (v: ProductForm) => (product ? api.patch(`/products/${product.id}`, v) : api.post('/products', v)),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Producto guardado', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="product-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="product-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Código" {...register('code')} error={errors.code?.message} />
        <Input label="Nombre" {...register('name')} error={errors.name?.message} />
        <label className="row"><input type="checkbox" {...register('isDelta')} /> Producto DELTA</label>
        <label className="row"><input type="checkbox" {...register('isActive')} /> Activo</label>
      </form>
    </Modal>
  );
}

type Tab = 'sales' | 'catalog';

export function ProductsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  const { can } = useAuth();
  const ls = useListState(['productId', 'agencyId', 'sold', 'from', 'to']);
  const sales = useList<Sale>('sales', '/sales', ls.params);
  const products = useQuery({ queryKey: ['ref', 'products'], queryFn: () => api.get<Product[]>('/products') });
  const agencies = useAgencyOptions();
  const [selling, setSelling] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  return (
    <>
      <PageHead title="Productos" actions={<>
        <Can permission="sales.create"><Button onClick={() => setSelling(true)}>Registrar venta</Button></Can>
        {tab === 'catalog' && <Can permission="products.create"><Button variant="secondary" onClick={() => setEditing('new')}>Nuevo producto</Button></Can>}
      </>} />
      <Tabs label="Productos" value={tab} onChange={setTab} tabs={[{ id: 'sales', label: 'Ventas' }, { id: 'catalog', label: 'Catálogo' }]} />
      {tab === 'sales' && (
        <>
          <FilterBar search={ls.search} onSearch={ls.setSearch}>
            <Select label="Producto" value={ls.filter('productId')} onChange={(e) => ls.setFilter('productId', e.target.value)} placeholder="Todos">{(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select label="Agencia" value={ls.filter('agencyId')} onChange={(e) => ls.setFilter('agencyId', e.target.value)} placeholder="Todas">{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            <Select label="Resultado" value={ls.filter('sold')} onChange={(e) => ls.setFilter('sold', e.target.value)} placeholder="Todos"><option value="true">Vendido</option><option value="false">No vendido</option></Select>
            <DatePicker label="Desde" value={ls.filter('from').slice(0, 10)} onChange={(e) => ls.setFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')} />
            <DatePicker label="Hasta" value={ls.filter('to').slice(0, 10)} onChange={(e) => ls.setFilter('to', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '')} />
          </FilterBar>
          <DataTable<Sale> caption="Ventas de productos" result={sales.data} isLoading={sales.isLoading} error={sales.error} onRetry={() => void sales.refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
            columns={[
              { key: 'soldAt', header: 'Fecha', render: (s) => formatDateTime(s.soldAt) },
              { key: 'product', header: 'Producto', render: (s) => <>{s.product.name} {s.product.isDelta && <Badge tone="info">DELTA</Badge>}</> },
              { key: 'agency', header: 'Agencia', render: (s) => s.agency.name },
              { key: 'manager', header: 'Gestor', render: (s) => s.manager.fullName },
              { key: 'sold', header: 'Resultado', render: (s) => <Badge tone={s.sold ? 'ok' : 'neutral'}>{s.sold ? 'Vendido' : 'No vendido'}</Badge> },
              { key: 'amount', header: 'Importe', render: (s) => formatNumber(s.amount) },
            ]} />
        </>
      )}
      {tab === 'catalog' && (products.error ? <ErrorState error={products.error} /> : !products.data ? <Skeleton /> : (
        <DataTable<Product> caption="Catálogo de productos" isLoading={false} page={1} pageSize={products.data.length || 1} onPage={() => undefined} onPageSize={() => undefined}
          result={{ data: products.data, meta: { page: 1, pageSize: products.data.length, total: products.data.length, totalPages: 1 } } as Paginated<Product>}
          columns={[
            { key: 'code', header: 'Código', render: (p) => p.code },
            { key: 'name', header: 'Nombre', render: (p) => p.name },
            { key: 'delta', header: 'DELTA', render: (p) => (p.isDelta ? 'Sí' : 'No') },
            { key: 'active', header: 'Estado', render: (p) => <Badge tone={p.isActive ? 'ok' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge> },
          ]}
          rowActions={(p) => (can('products.update') ? <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Editar</Button> : null)} />
      ))}
      {selling && <SaleFormModal onClose={() => setSelling(false)} />}
      {editing && <ProductFormModal product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ───────────── Clientes ───────────── */
const customerSchema = z.object({ code: z.string().trim().min(1, 'Obligatorio').max(30), fullName: z.string().trim().min(1, 'Obligatorio').max(120), email: z.string().trim().email('Correo inválido').or(z.literal('')), phone: z.string().trim().max(30).optional() });
type CustomerForm = z.infer<typeof customerSchema>;

function CustomerFormModal({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerForm>({ resolver: zodResolver(customerSchema), defaultValues: { code: customer?.code ?? '', fullName: customer?.fullName ?? '', email: '', phone: '' } });
  const save = useMutation({
    mutationFn: (v: CustomerForm) => { const b = { ...v, email: v.email || null, phone: v.phone || null }; return customer ? api.patch(`/customers/${customer.id}`, b) : api.post('/customers', b); },
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Cliente guardado', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="customer-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="customer-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Input label="Código" {...register('code')} error={errors.code?.message} />
        <Input label="Nombre completo" {...register('fullName')} error={errors.fullName?.message} />
        <Input label="Correo" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Teléfono" {...register('phone')} error={errors.phone?.message} />
      </form>
    </Modal>
  );
}

export function CustomersPage() {
  const ls = useListState();
  const { data, isLoading, error, refetch } = useList<Customer>('customers', '/customers', ls.params);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  return (
    <>
      <PageHead title="Clientes" actions={<Can permission="customers.create"><Button onClick={() => setEditing('new')}>Nuevo cliente</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch} />
      <DataTable<Customer> caption="Listado de clientes" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
        columns={[{ key: 'code', header: 'Código', render: (c) => c.code }, { key: 'fullName', header: 'Nombre', render: (c) => c.fullName }]}
        rowActions={(c) => <Can permission="customers.update"><Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Editar</Button></Can>} />
      {editing && <CustomerFormModal customer={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
