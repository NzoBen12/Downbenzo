import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { buildOrderBy, paginated, paginationSchema } from '../../common/pagination';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

export const passwordSchema = z
  .string()
  .min(12, 'Mínimo 12 caracteres')
  .max(128)
  .regex(/[a-z]/, 'Debe incluir minúsculas')
  .regex(/[A-Z]/, 'Debe incluir mayúsculas')
  .regex(/\d/, 'Debe incluir números');

const userBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  fullName: z.string().trim().min(1).max(120),
  roleId: z.string().min(1),
  agencyId: z.string().min(1).optional().nullable(),
  password: passwordSchema,
});
const userUpdate = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  roleId: z.string().min(1).optional(),
  agencyId: z.string().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});
const userQuery = paginationSchema.extend({ roleId: z.string().optional(), isActive: z.enum(['true', 'false']).optional() });
type UserBody = z.infer<typeof userBody>;
type UserUpdate = z.infer<typeof userUpdate>;
type UserQuery = z.infer<typeof userQuery>;

const select = {
  id: true, email: true, username: true, fullName: true, isActive: true, isBlocked: true, lastLoginAt: true, createdAt: true,
  agencyId: true, role: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(q: UserQuery) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      roleId: q.roleId,
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.search ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { username: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where, select, orderBy: buildOrderBy(q.sortBy, q.sortDir, ['fullName', 'email', 'lastLoginAt', 'createdAt'], 'fullName'),
        skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { ...select, manager: { select: { id: true, fullName: true } } } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const activity = await this.prisma.auditLog.findMany({
      where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, action: true, entity: true, createdAt: true, result: true },
    });
    return { ...user, activity };
  }

  /** Evita escalada de privilegios: sólo un Super Admin puede conceder o tocar el rol SUPER_ADMIN. */
  private async assertCanAssignRole(roleId: string, ctx: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Rol inexistente');
    if (role.code === 'SUPER_ADMIN' && ctx.user?.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Sólo un Super Admin puede asignar ese rol');
    }
  }

  async create(b: UserBody, ctx: RequestContext) {
    await this.assertCanAssignRole(b.roleId, ctx);
    const { password, ...rest } = b;
    const created = await this.prisma.user.create({ data: { ...rest, passwordHash: await argon2.hash(password) }, select });
    await this.audit.log(ctx, { action: 'user.create', entity: 'User', entityId: created.id, after: created });
    return created;
  }

  async update(id: string, b: UserUpdate, ctx: RequestContext) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
    if (!existing) throw new NotFoundException('Usuario no encontrado');
    if (existing.role.code === 'SUPER_ADMIN' && ctx.user?.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('No puede modificar a un Super Admin');
    if (b.roleId && b.roleId !== existing.roleId) await this.assertCanAssignRole(b.roleId, ctx);
    if (id === ctx.user?.id && (b.isActive === false || (b.roleId && b.roleId !== existing.roleId))) {
      throw new BadRequestException('No puede desactivarse ni cambiar su propio rol');
    }
    const { password, ...rest } = b;
    const before = await this.prisma.user.findUnique({ where: { id }, select });
    const sensitive = Boolean(password) || b.roleId !== undefined || b.isActive === false;
    const after = await this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await argon2.hash(password) } : {}), ...(sensitive ? { tokenVersion: { increment: 1 } } : {}) },
      select,
    });
    const action = b.roleId && b.roleId !== existing.roleId ? 'user.role_change' : password ? 'user.password_reset' : 'user.update';
    await this.audit.log(ctx, { action, entity: 'User', entityId: id, before, after });
    return after;
  }

  async setBlocked(id: string, blocked: boolean, ctx: RequestContext) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
    if (!existing) throw new NotFoundException('Usuario no encontrado');
    if (id === ctx.user?.id) throw new BadRequestException('No puede bloquearse a sí mismo');
    if (existing.role.code === 'SUPER_ADMIN' && ctx.user?.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('No puede modificar a un Super Admin');
    const after = await this.prisma.user.update({
      where: { id },
      data: { isBlocked: blocked, failedAttempts: 0, lockedUntil: null, tokenVersion: { increment: 1 } },
      select,
    });
    await this.audit.log(ctx, { action: blocked ? 'user.block' : 'user.unblock', entity: 'User', entityId: id, before: { isBlocked: existing.isBlocked }, after: { isBlocked: blocked } });
    return after;
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Get() @RequirePermissions('users.read')
  list(@Query(new ZodPipe(userQuery)) q: UserQuery) { return this.service.list(q); }
  @Get(':id') @RequirePermissions('users.read')
  get(@Param('id') id: string) { return this.service.get(id); }
  @Post() @RequirePermissions('users.create')
  create(@Body(new ZodPipe(userBody)) b: UserBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Patch(':id') @RequirePermissions('users.update')
  update(@Param('id') id: string, @Body(new ZodPipe(userUpdate)) b: UserUpdate, @Ctx() ctx: RequestContext) { return this.service.update(id, b, ctx); }
  @Post(':id/block') @RequirePermissions('users.update')
  block(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.setBlocked(id, true, ctx); }
  @Post(':id/unblock') @RequirePermissions('users.update')
  unblock(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.setBlocked(id, false, ctx); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
