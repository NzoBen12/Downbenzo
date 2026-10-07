import { BadRequestException, Inject, Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { AuditService } from '../audit/audit.service';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_PROVIDER, AuthProvider, AuthUser, RequestContext, TokenPayload } from './auth.types';

export const ENV = Symbol('ENV');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(identifier: string, secret: string, ctx: RequestContext) {
    const candidate = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }], deletedAt: null },
    });
    if (candidate?.lockedUntil && candidate.lockedUntil > new Date()) {
      throw new HttpException('Cuenta bloqueada temporalmente', HttpStatus.LOCKED);
    }
    const result = await this.provider.authenticate(identifier, secret);
    if (!result || !candidate || candidate.isBlocked || !candidate.isActive) {
      if (candidate) await this.registerFailure(candidate.id);
      await this.audit.log(ctx, { action: 'auth.login', entity: 'User', entityId: candidate?.id, result: 'FAILURE' });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    await this.prisma.user.update({
      where: { id: candidate.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const user = await this.loadAuthUser(candidate.id);
    await this.audit.log({ ...ctx, user: user! }, { action: 'auth.login', entity: 'User', entityId: candidate.id });
    return { user: user!, token: this.sign(candidate.id, candidate.tokenVersion) };
  }

  private async registerFailure(userId: string) {
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 } },
    });
    if (u.failedAttempts >= this.env.LOGIN_MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedAttempts: 0,
          lockedUntil: new Date(Date.now() + this.env.LOGIN_LOCK_MINUTES * 60_000),
        },
      });
    }
  }

  sign(userId: string, tokenVersion: number): string {
    const payload: TokenPayload = { sub: userId, tv: tokenVersion };
    return jwt.sign(payload, this.env.JWT_SECRET, {
      expiresIn: `${this.env.JWT_EXPIRES_IN_MINUTES}m`,
      algorithm: 'HS256',
    });
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, this.env.JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;
    } catch {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }
    const user = await this.loadAuthUser(payload.sub, payload.tv);
    if (!user) throw new UnauthorizedException('Sesión inválida');
    return user;
  }

  async loadAuthUser(id: string, tokenVersion?: number): Promise<AuthUser | null> {
    const u = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, isActive: true, isBlocked: false },
      include: { role: { include: { permissions: { include: { permission: true } } } }, manager: true },
    });
    if (!u || (tokenVersion !== undefined && u.tokenVersion !== tokenVersion)) return null;
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      roleCode: u.role.code,
      permissions: u.role.permissions.map((rp) => rp.permission.code),
      agencyId: u.agencyId ?? u.manager?.agencyId ?? null,
      managerId: u.manager?.id ?? null,
    };
  }

  /** Cambio de contraseña propio (proveedor local). Invalida el resto de sesiones y emite un token nuevo. */
  async changePassword(userId: string, current: string, next: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new BadRequestException('Esta cuenta no usa contraseña local');
    if (!(await argon2.verify(user.passwordHash, current))) {
      await this.audit.log(ctx, { action: 'auth.password_change', entity: 'User', entityId: userId, result: 'FAILURE' });
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }
    if (current === next) throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(next), tokenVersion: { increment: 1 } },
    });
    await this.audit.log(ctx, { action: 'auth.password_change', entity: 'User', entityId: userId });
    return this.sign(updated.id, updated.tokenVersion);
  }

  /** Invalida todas las sesiones del usuario (logout / bloqueo / cambio de rol). */
  async revokeSessions(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }
}
