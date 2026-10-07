import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC, PERMISSIONS } from './decorators';

export const SESSION_COOKIE = 'bange_session';
export const CSRF_COOKIE = 'bange_csrf';
export const CSRF_HEADER = 'x-csrf-token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = req.cookies?.[SESSION_COOKIE] ?? bearer;
    if (!token) throw new UnauthorizedException('No autenticado');
    req.user = await this.auth.verify(token);
    req.usedCookie = Boolean(req.cookies?.[SESSION_COOKIE]);
    return true;
  }
}

/** Protección CSRF (double-submit) para peticiones con cookie de sesión que modifican estado. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.usedCookie) return true;
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (!cookie || !header || cookie !== header) throw new ForbiddenException('Token CSRF inválido');
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user) throw new UnauthorizedException('No autenticado');
    const ok = required.every((p) => user.permissions.includes(p));
    if (!ok) throw new ForbiddenException('No tiene permiso para esta operación');
    return true;
  }
}
