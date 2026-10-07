export interface NavItem { to: string; label: string; icon: string; permission: string }
export interface NavGroup { group: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { group: 'General', items: [{ to: '/', label: 'Inicio', icon: '⌂', permission: 'dashboard.read' }, { to: '/dashboard', label: 'Dashboard', icon: '▦', permission: 'dashboard.read' }] },
  {
    group: 'Comercial',
    items: [
      { to: '/agencies', label: 'Agencias', icon: '🏦', permission: 'agencies.read' },
      { to: '/managers', label: 'Gestores', icon: '👤', permission: 'managers.read' },
      { to: '/visits', label: 'Visitas', icon: '📋', permission: 'visits.read' },
      { to: '/prospects', label: 'No-clientes', icon: '🎯', permission: 'prospects.read' },
      { to: '/customers', label: 'Clientes', icon: '🧑‍💼', permission: 'customers.read' },
      { to: '/products', label: 'Productos', icon: '🛍', permission: 'products.read' },
      { to: '/calendar', label: 'Calendario', icon: '📅', permission: 'visits.read' },
    ],
  },
  {
    group: 'Operaciones',
    items: [
      { to: '/currency', label: 'Cambio de divisa', icon: '💱', permission: 'currency.read' },
      { to: '/lots', label: 'Lotes', icon: '📦', permission: 'lots.read' },
      { to: '/cards', label: 'Tarjetas', icon: '💳', permission: 'cards.read' },
    ],
  },
  {
    group: 'Análisis',
    items: [
      { to: '/reports', label: 'Informes', icon: '📊', permission: 'reports.read' },
      { to: '/information', label: 'Información', icon: 'ℹ', permission: 'goals.read' },
    ],
  },
  {
    group: 'Administración',
    items: [
      { to: '/users', label: 'Usuarios', icon: '🔑', permission: 'users.read' },
      { to: '/roles', label: 'Roles', icon: '🛡', permission: 'roles.read' },
      { to: '/settings', label: 'Configuraciones', icon: '⚙', permission: 'config.read' },
      { to: '/audit', label: 'Auditoría', icon: '🧾', permission: 'audit.read' },
    ],
  },
];

/** Etiquetas para migas de pan. */
export const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.to.slice(1), i.label]),
);
