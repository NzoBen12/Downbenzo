export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roleCode: string;
  permissions: string[];
  agencyId: string | null;
  managerId: string | null;
}

export interface TokenPayload {
  sub: string;
  tv: number;
}

/** Contrato desacoplado para conectar SSO / LDAP / AD / OIDC corporativo. */
export interface AuthProvider {
  readonly name: string;
  /** Devuelve el id interno de usuario si las credenciales son válidas, o null. */
  authenticate(identifier: string, secret: string): Promise<{ userId: string } | null>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface RequestContext {
  user?: AuthUser;
  ip?: string;
  requestId?: string;
}
