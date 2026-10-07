import { AuthUser } from '../auth/auth.types';
import { AGENCY_SCOPED_ROLES } from './permissions';

export interface DataScope {
  agencyId?: string;
  managerId?: string;
}

/**
 * Alcance de datos por rol: Jefe/a de Agencia ve su agencia; Gestor/a ve su agencia y
 * sólo su propia actividad (visitas, ventas). Resto de roles: alcance global.
 */
export function dataScope(user: AuthUser): DataScope {
  if (!AGENCY_SCOPED_ROLES.includes(user.roleCode)) return {};
  const scope: DataScope = { agencyId: user.agencyId ?? '__none__' };
  if (user.roleCode === 'MANAGER') scope.managerId = user.managerId ?? '__none__';
  return scope;
}
