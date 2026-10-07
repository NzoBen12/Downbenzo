import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { NotificationItem, SearchGroup } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { useDebounced } from '../lib/hooks';
import { NAV } from './nav';

const CATEGORY_LABEL: Record<string, string> = {
  agencies: 'Agencias', managers: 'Gestores', prospects: 'No-clientes', customers: 'Clientes', visits: 'Visitas', cards: 'Tarjetas', lots: 'Lotes',
};

function GlobalSearch() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ['search', q], enabled: q.length >= 2,
    queryFn: () => api.get<{ results: SearchGroup[] }>('/search', { q }),
  });
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="search-box" ref={box} role="search">
      <label className="sr-only" htmlFor="global-search">Búsqueda global</label>
      <input id="global-search" className="input" type="search" placeholder="Buscar agencias, gestores, visitas, tarjetas…" value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} autoComplete="off" />
      {open && q.length >= 2 && (
        <div className="search-results" role="region" aria-label="Resultados de búsqueda" aria-live="polite">
          {isFetching && <p style={{ padding: 12, margin: 0 }}>Buscando…</p>}
          {!isFetching && data?.results.length === 0 && <p style={{ padding: 12, margin: 0 }}>Sin resultados para “{q}”.</p>}
          {data?.results.map((g) => (
            <div key={g.category}>
              <h4>{CATEGORY_LABEL[g.category] ?? g.category}</h4>
              {g.items.map((i) => (
                <a key={i.id} href={i.href} onClick={(e) => { e.preventDefault(); setOpen(false); setText(''); navigate(i.href); }}>
                  <strong>{i.title}</strong> <small style={{ color: 'var(--c-muted)' }}>{i.subtitle}</small>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'], enabled: can('notifications.read'), refetchInterval: 60_000,
    queryFn: () => api.get<{ data: NotificationItem[]; unreadCount: number }>('/notifications'),
  });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  if (!can('notifications.read')) return null;
  return (
    <div style={{ position: 'relative' }}>
      <Button variant="secondary" size="sm" aria-label={`Notificaciones (${data?.unreadCount ?? 0} sin leer)`} aria-expanded={open} onClick={() => setOpen(!open)}>
        🔔 {data?.unreadCount ? <strong>{data.unreadCount}</strong> : null}
      </Button>
      {open && (
        <div className="search-results" style={{ left: 'auto', right: 0, width: 320 }}>
          <div className="row" style={{ padding: 8, justifyContent: 'space-between' }}>
            <strong>Notificaciones</strong>
            <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>Marcar leídas</Button>
          </div>
          {data?.data.length === 0 && <p style={{ padding: 12, margin: 0 }}>No tiene notificaciones.</p>}
          {data?.data.map((n) => (
            <Link key={n.id} to={n.link ?? '#'} onClick={() => setOpen(false)} style={{ fontWeight: n.readAt ? 400 : 700 }}>{n.title}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const label = (p: string) => NAV.flatMap((g) => g.items).find((i) => i.to === `/${p}`)?.label ?? p;
  return (
    <nav aria-label="Ruta de navegación" className="breadcrumb" style={{ margin: 0 }}>
      <Link to="/">Inicio</Link>{parts.map((p, i) => <span key={i}> / {i === 0 ? label(p) : <span>{p.length > 14 ? 'detalle' : p}</span>}</span>)}
    </nav>
  );
}

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('sidebar') === '1'; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('sidebar', c ? '0' : '1'); } catch { /* sin almacenamiento */ } return !c; });

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <a className="skip-link" href="#main">Saltar al contenido</a>
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="brand"><span className="brand-mark" aria-hidden="true">B</span><span className="brand-text">BANGE</span></div>
        <nav>
          <ul className="nav">
            {NAV.map((g) => {
              const items = g.items.filter((i) => can(i.permission));
              if (items.length === 0) return null;
              return (
                <li key={g.group}>
                  <div className="nav-group">{g.group}</div>
                  <ul className="nav">
                    {items.map((i) => (
                      <li key={i.to}>
                        <NavLink to={i.to} end={i.to === '/'} title={i.label}>
                          <span className="ico" aria-hidden="true">{i.icon}</span><span className="nav-label">{i.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button className="menu-btn" variant="secondary" size="sm" aria-label="Abrir menú" onClick={() => setMobileOpen((o) => !o)}>☰</Button>
          <Button variant="secondary" size="sm" aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'} onClick={toggle} className="desktop-only">⇔</Button>
          <GlobalSearch />
          <span className="spacer" />
          <Notifications />
          <span aria-label="Usuario actual" style={{ fontWeight: 600 }}>{user?.fullName}</span>
          <Button variant="secondary" size="sm" onClick={() => void logout()}>Salir</Button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
