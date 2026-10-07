import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, ApiError } from '../api/client';
import { AuditEntry, ConfigItem, Role, UserRow } from '../api/types';
import { Can, useAuth } from '../auth/AuthContext';
import { FilterBar, PageHead } from '../components/FilterBar';
import { Badge, Button, Card, ConfirmDialog, DataTable, DatePicker, Drawer, ErrorState, Input, Modal, Select, Skeleton, useToast } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { useList, useListState } from '../lib/hooks';

const err = (e: unknown) => (e instanceof ApiError ? e.message : 'Error inesperado');
const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/roles') });

/* ───────────── Usuarios ───────────── */
const password = z.string().min(12, 'Mínimo 12 caracteres').regex(/[a-z]/, 'Incluya minúsculas').regex(/[A-Z]/, 'Incluya mayúsculas').regex(/\d/, 'Incluya números');
const createSchema = z.object({ fullName: z.string().trim().min(1, 'Obligatorio'), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, '3-40 caracteres: letras, números . _ -'), email: z.string().trim().email('Correo inválido'), roleId: z.string().min(1, 'Seleccione un rol'), password });
const editSchema = createSchema.omit({ username: true, password: true }).extend({ password: password.optional().or(z.literal('')) });
type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

function UserForm({ user, onClose }: { user?: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: roles } = useRoles();
  const { register, handleSubmit, formState: { errors } } = useForm<CreateForm & EditForm>({
    resolver: zodResolver(user ? editSchema : createSchema) as never,
    defaultValues: { fullName: user?.fullName ?? '', email: user?.email ?? '', roleId: user?.role.id ?? '', username: user?.username ?? '', password: '' },
  });
  const save = useMutation({
    mutationFn: (v: CreateForm & EditForm) => user
      ? api.patch(`/users/${user.id}`, { fullName: v.fullName, email: v.email, roleId: v.roleId, ...(v.password ? { password: v.password } : {}) })
      : api.post('/users', { fullName: v.fullName, email: v.email, username: v.username, roleId: v.roleId, password: v.password }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Usuario guardado', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="user-form" loading={save.isPending}>Guardar</Button></>}>
      <form id="user-form" className="form-grid" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate autoComplete="off">
        <Input label="Nombre completo" {...register('fullName')} error={errors.fullName?.message} />
        {!user && <Input label="Usuario" {...register('username')} error={errors.username?.message} />}
        <Input label="Correo" type="email" {...register('email')} error={errors.email?.message} />
        <Select label="Rol" placeholder="Seleccione…" {...register('roleId')} error={errors.roleId?.message}>{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        <Input label={user ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} type="password" autoComplete="new-password" help="Mín. 12 caracteres, mayúsculas, minúsculas y números" {...register('password')} error={errors.password?.message} />
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const ls = useListState(['roleId', 'isActive'], { sortBy: 'fullName', sortDir: 'asc' });
  const { data, isLoading, error, refetch } = useList<UserRow>('users', '/users', ls.params);
  const { data: roles } = useRoles();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [confirm, setConfirm] = useState<UserRow | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (u: UserRow) => api.post(`/users/${u.id}/${u.isBlocked ? 'unblock' : 'block'}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['users'] }); setConfirm(null); toast.show('Estado actualizado', 'success'); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <>
      <PageHead title="Usuarios" actions={<Can permission="users.create"><Button onClick={() => setEditing('new')}>Nuevo usuario</Button></Can>} />
      <FilterBar search={ls.search} onSearch={ls.setSearch}>
        <Select label="Rol" value={ls.filter('roleId')} onChange={(e) => ls.setFilter('roleId', e.target.value)} placeholder="Todos">{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
      </FilterBar>
      <DataTable<UserRow> caption="Listado de usuarios" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize} sortBy={ls.sortBy} sortDir={ls.sortDir} onSort={ls.toggleSort}
        columns={[
          { key: 'fullName', header: 'Nombre', sortable: true, render: (u) => <button className="btn ghost sm" onClick={() => setDetail(u)}>{u.fullName}</button> },
          { key: 'username', header: 'Usuario', render: (u) => u.username },
          { key: 'email', header: 'Correo', sortable: true, render: (u) => u.email },
          { key: 'role', header: 'Rol', render: (u) => u.role.name },
          { key: 'lastLoginAt', header: 'Último acceso', sortable: true, render: (u) => formatDateTime(u.lastLoginAt) },
          { key: 'state', header: 'Estado', render: (u) => <Badge tone={u.isBlocked ? 'danger' : u.isActive ? 'ok' : 'neutral'}>{u.isBlocked ? 'Bloqueado' : u.isActive ? 'Activo' : 'Inactivo'}</Badge> },
        ]}
        rowActions={(u) => <Can permission="users.update"><Button size="sm" variant="secondary" onClick={() => setEditing(u)}>Editar</Button>{u.id !== me?.id && <Button size="sm" variant="secondary" onClick={() => setConfirm(u)}>{u.isBlocked ? 'Desbloquear' : 'Bloquear'}</Button>}</Can>} />
      {editing && <UserForm user={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {confirm && <ConfirmDialog title={confirm.isBlocked ? 'Desbloquear usuario' : 'Bloquear usuario'} message={`¿Confirma ${confirm.isBlocked ? 'desbloquear' : 'bloquear'} a ${confirm.fullName}? ${confirm.isBlocked ? '' : 'Sus sesiones activas se cerrarán.'}`} danger={!confirm.isBlocked} loading={toggle.isPending} onConfirm={() => toggle.mutate(confirm)} onCancel={() => setConfirm(null)} />}
      {detail && <UserDrawer user={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function UserDrawer({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { data, error } = useQuery({ queryKey: ['user', user.id], queryFn: () => api.get<UserRow & { activity: { id: string; action: string; createdAt: string; result: string }[] }>(`/users/${user.id}`) });
  return (
    <Drawer title={user.fullName} onClose={onClose}>
      {error ? <ErrorState error={error} /> : !data ? <Skeleton /> : (
        <>
          <dl className="kv"><dt>Usuario</dt><dd>{data.username}</dd><dt>Correo</dt><dd>{data.email}</dd><dt>Rol</dt><dd>{data.role.name}</dd><dt>Último acceso</dt><dd>{formatDateTime(data.lastLoginAt)}</dd></dl>
          <h3 style={{ margin: '16px 0 8px' }}>Actividad reciente</h3>
          <ul className="plain">{data.activity.map((a) => <li key={a.id}>{formatDateTime(a.createdAt)} · {a.action} {a.result === 'FAILURE' && <Badge tone="danger">fallo</Badge>}</li>)}</ul>
        </>
      )}
    </Drawer>
  );
}

/* ───────────── Roles ───────────── */
function RoleEditor({ role, onClose }: { role?: Role; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { data: perms } = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<{ id: string; code: string }[]>('/roles/permissions') });
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const readOnly = role?.isSystem ?? false;
  const groups = Object.entries((perms ?? []).reduce<Record<string, string[]>>((acc, p) => { const [r] = p.code.split('.'); (acc[r] ??= []).push(p.code); return acc; }, {}));
  const save = useMutation({
    mutationFn: () => role ? api.patch(`/roles/${role.id}`, { name, permissions: selected }) : api.post('/roles', { code, name, permissions: selected }),
    onSuccess: () => { void qc.invalidateQueries(); toast.show('Rol guardado', 'success'); onClose(); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  return (
    <Modal title={role ? `Rol · ${role.name}` : 'Nuevo rol'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</Button>{!readOnly && <Button loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button>}</>}>
      {readOnly && <p><Badge tone="info">Rol de sistema</Badge> No es editable.</p>}
      <div className="form-grid">
        {!role && <Input label="Código" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} help="Ej. ANALISTA_REGIONAL" />}
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
      </div>
      {role && role.userCount > 0 && <p>Usuarios asignados: {role.userCount}</p>}
      <fieldset style={{ border: '1px solid var(--c-border)', borderRadius: 8, marginTop: 12 }}>
        <legend>Permisos</legend>
        {groups.map(([group, codes]) => (
          <div key={group} className="row" style={{ marginBottom: 6 }}>
            <strong style={{ width: 110 }}>{group}</strong>
            {codes.map((c) => {
              const allowed = user?.permissions.includes(c) ?? false;
              return (
                <label key={c} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={selected.includes(c)} disabled={readOnly || !allowed} onChange={(e) => setSelected((s) => e.target.checked ? [...s, c] : s.filter((x) => x !== c))} />{c.split('.')[1]}
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
    </Modal>
  );
}

export function RolesPage() {
  const { data, error, isLoading, refetch } = useRoles();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  return (
    <>
      <PageHead title="Roles y permisos" actions={<Can permission="roles.create"><Button onClick={() => setEditing('new')}>Nuevo rol</Button></Can>} />
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading || !data ? <Skeleton lines={5} /> : (
        <div className="grid cols-3">
          {data.map((r) => (
            <Card key={r.id} title={r.name} actions={r.isSystem ? <Badge tone="info">Sistema</Badge> : undefined}>
              <p style={{ margin: '0 0 8px' }}>{r.description ?? '—'}</p>
              <p style={{ margin: '0 0 12px', color: 'var(--c-muted)' }}>{r.permissions.length} permisos · {r.userCount} usuarios</p>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>{r.isSystem ? 'Ver' : 'Editar'}</Button>
            </Card>
          ))}
        </div>
      )}
      {editing && <RoleEditor role={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ───────────── Configuraciones ───────────── */
export function SettingsPage() {
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['config'], queryFn: () => api.get<ConfigItem[]>('/config') });
  const { can } = useAuth();
  const [editing, setEditing] = useState<ConfigItem | null>(null);
  const [raw, setRaw] = useState('');
  const [invalid, setInvalid] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown; category: string }) => api.put(`/config/${v.key}`, { value: v.value, category: v.category }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['config'] }); setEditing(null); toast.show('Configuración guardada', 'success'); },
    onError: (e) => toast.show(err(e), 'error'),
  });
  const submit = () => {
    try { setInvalid(''); save.mutate({ key: editing!.key, value: JSON.parse(raw), category: editing!.category }); } catch { setInvalid('Valor JSON inválido'); }
  };
  const categories = [...new Set((data ?? []).map((c) => c.category))];
  return (
    <>
      <PageHead title="Configuraciones" />
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading || !data ? <Skeleton lines={5} /> : (
        <div className="grid cols-2">
          {categories.map((cat) => (
            <Card key={cat} title={cat === 'integration' ? 'Integraciones (pendientes de conexión)' : cat}>
              <ul className="plain">{data.filter((c) => c.category === cat).map((c) => (
                <li key={c.key} className="row" style={{ justifyContent: 'space-between' }}>
                  <span><code>{c.key}</code> = {JSON.stringify(c.value)}</span>
                  {can('config.update') && <Button size="sm" variant="secondary" onClick={() => { setEditing(c); setRaw(JSON.stringify(c.value)); }}>Editar</Button>}
                </li>
              ))}</ul>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <Modal title={`Editar ${editing.key}`} onClose={() => setEditing(null)} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button><Button loading={save.isPending} onClick={submit}>Guardar</Button></>}>
          <Input label="Valor (JSON)" value={raw} onChange={(e) => setRaw(e.target.value)} error={invalid} />
        </Modal>
      )}
    </>
  );
}

/* ───────────── Auditoría ───────────── */
export function AuditPage() {
  const ls = useListState(['entity', 'result', 'from', 'to']);
  const { data, isLoading, error, refetch } = useList<AuditEntry>('audit', '/audit', ls.params);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  return (
    <>
      <PageHead title="Auditoría" />
      <FilterBar search={ls.search} onSearch={ls.setSearch}>
        <Input label="Entidad" value={ls.filter('entity')} onChange={(e) => ls.setFilter('entity', e.target.value)} placeholder="Visit, User…" />
        <Select label="Resultado" value={ls.filter('result')} onChange={(e) => ls.setFilter('result', e.target.value)} placeholder="Todos"><option value="SUCCESS">Éxito</option><option value="FAILURE">Fallo</option></Select>
        <DatePicker label="Desde" value={ls.filter('from').slice(0, 10)} onChange={(e) => ls.setFilter('from', e.target.value ? new Date(e.target.value).toISOString() : '')} />
        <DatePicker label="Hasta" value={ls.filter('to').slice(0, 10)} onChange={(e) => ls.setFilter('to', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '')} />
      </FilterBar>
      <DataTable<AuditEntry> caption="Registro de auditoría" result={data} isLoading={isLoading} error={error} onRetry={() => void refetch()} page={ls.page} pageSize={ls.pageSize} onPage={ls.setPage} onPageSize={ls.setPageSize}
        columns={[
          { key: 'createdAt', header: 'Fecha', render: (a) => formatDateTime(a.createdAt) },
          { key: 'user', header: 'Usuario', render: (a) => a.user?.fullName ?? 'sistema' },
          { key: 'action', header: 'Operación', render: (a) => a.action },
          { key: 'entity', header: 'Entidad', render: (a) => `${a.entity}${a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}` },
          { key: 'ip', header: 'IP', render: (a) => a.ip ?? '—' },
          { key: 'result', header: 'Resultado', render: (a) => <Badge tone={a.result === 'SUCCESS' ? 'ok' : 'danger'}>{a.result === 'SUCCESS' ? 'Éxito' : 'Fallo'}</Badge> },
        ]}
        rowActions={(a) => <Button size="sm" variant="secondary" onClick={() => setOpen(a)}>Detalle</Button>} />
      {open && (
        <Drawer title={open.action} onClose={() => setOpen(null)}>
          <h3>Valor anterior</h3><pre style={{ overflow: 'auto' }}>{JSON.stringify(open.before, null, 2) ?? '—'}</pre>
          <h3>Valor nuevo</h3><pre style={{ overflow: 'auto' }}>{JSON.stringify(open.after, null, 2) ?? '—'}</pre>
        </Drawer>
      )}
    </>
  );
}
