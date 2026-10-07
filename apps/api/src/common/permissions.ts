/** Catálogo único de permisos. El backend es la fuente de verdad; el frontend sólo los usa para UX. */
const RESOURCES = {
  dashboard: ['read'],
  agencies: ['read', 'create', 'update', 'delete'],
  managers: ['read', 'create', 'update', 'delete'],
  prospects: ['read', 'create', 'update', 'delete'],
  customers: ['read', 'create', 'update'],
  visits: ['read', 'create', 'update', 'delete'],
  products: ['read', 'create', 'update'],
  sales: ['read', 'create'],
  currency: ['read', 'create', 'update'],
  lots: ['read', 'create', 'update'],
  cards: ['read', 'create', 'update'],
  goals: ['read', 'create', 'update'],
  actions: ['read', 'create', 'update'],
  reports: ['read', 'export'],
  notifications: ['read'],
  users: ['read', 'create', 'update'],
  roles: ['read', 'create', 'update'],
  config: ['read', 'update'],
  audit: ['read'],
} as const;

export const ALL_PERMISSIONS: string[] = Object.entries(RESOURCES).flatMap(([r, actions]) =>
  actions.map((a) => `${r}.${a}`),
);

const reads = ALL_PERMISSIONS.filter((p) => p.endsWith('.read'));
const exclude = (list: string[], prefixes: string[]) =>
  list.filter((p) => !prefixes.some((x) => p.startsWith(x)));

export interface SystemRole {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Acceso total',
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Administración de la plataforma',
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith('roles.') || p === 'roles.read'),
  },
  {
    code: 'COMMERCIAL_LEAD',
    name: 'Responsable comercial',
    description: 'Gestión comercial global',
    permissions: exclude(ALL_PERMISSIONS, ['users.', 'roles.', 'config.', 'audit.']).concat([
      'users.read',
    ]),
  },
  {
    code: 'AGENCY_HEAD',
    name: 'Jefe/a de Agencia',
    description: 'Gestión de su agencia',
    permissions: exclude(ALL_PERMISSIONS, ['users.', 'roles.', 'config.', 'audit.', 'agencies.create', 'agencies.delete']),
  },
  {
    code: 'MANAGER',
    name: 'Gestor/a Comercial',
    description: 'Actividad comercial propia',
    permissions: [
      'dashboard.read',
      'agencies.read',
      'managers.read',
      'prospects.read',
      'prospects.create',
      'prospects.update',
      'customers.read',
      'visits.read',
      'visits.create',
      'visits.update',
      'products.read',
      'sales.read',
      'sales.create',
      'currency.read',
      'currency.create',
      'goals.read',
      'actions.read',
      'actions.update',
      'notifications.read',
    ],
  },
  {
    code: 'VIEWER',
    name: 'Consulta',
    description: 'Sólo lectura',
    permissions: reads.filter((p) => !['users.read', 'roles.read', 'config.read', 'audit.read'].includes(p)),
  },
];

/** Roles cuyo alcance de datos está limitado a su propia agencia / a sí mismos. */
export const AGENCY_SCOPED_ROLES = ['AGENCY_HEAD', 'MANAGER'];
