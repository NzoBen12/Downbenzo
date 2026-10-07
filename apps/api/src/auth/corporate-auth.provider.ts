import { Injectable, NotImplementedException } from '@nestjs/common';
import { AuthProvider } from './auth.types';

/**
 * Punto de integración para SSO / LDAP / Active Directory / OIDC de BANGE.
 * PENDIENTE DE INTEGRACIÓN EXTERNA: implementar `authenticate` contra el IdP corporativo
 * y mapear la identidad externa a `User.externalId`. Ver docs/security.md.
 */
@Injectable()
export class CorporateAuthProvider implements AuthProvider {
  readonly name = 'corporate';
  authenticate(): Promise<{ userId: string } | null> {
    throw new NotImplementedException('Proveedor de autenticación corporativo no configurado');
  }
}
