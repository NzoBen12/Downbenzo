import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { ALL_PERMISSIONS } from '../../common/permissions';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const permissionList = z.array(z.string().refine((p) => ALL_PERMISSIONS.includes(p), 'Permiso desconocido')).max(ALL_PERMISSIONS.length);
const roleBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{2,39}$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  permissions: permissionList,
});
const roleUpdate = roleBody.omit({ code: true }).partial();
type RoleBody = z.infer<typeof roleBody>;
type RoleUpdate = z.infer<typeof roleUpdate>;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async serialize(id?: string) {
    const roles = await this.prisma.role.findMany({
      where: id ? { id } : {},
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem,
      userCount: r._count.users, permissions: r.permissions.map((p) => p.permission.code).sort(),
    }));
  }

  list() { return this.serialize(); }
  permissions() { return this.prisma.permission.findMany({ orderBy: { code: 'asc' } }); }

  async get(id: string) {
    const [role] = await this.serialize(id);
    if (!role) throw new NotFoundException('Rol no encontrado');
    const users = await this.prisma.user.findMany({ where: { roleId: id, deletedAt: null }, select: { id: true, fullName: true, email: true } });
    return { ...role, users };
  }

  private async setPermissions(roleId: string, codes: string[]) {
    const perms = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) }),
    ]);
  }

  async create(b: RoleBody, ctx: RequestContext) {
    this.assertNoEscalation(b.permissions, ctx);
    const role = await this.prisma.role.create({ data: { code: b.code, name: b.name, description: b.description } });
    await this.setPermissions(role.id, b.permissions);
    const [after] = await this.serialize(role.id);
    await this.audit.log(ctx, { action: 'role.create', entity: 'Role', entityId: role.id, after });
    return after;
  }

  /** Un administrador no puede conceder permisos que él mismo no posee. */
  private assertNoEscalation(perms: string[], ctx: RequestContext) {
    const own = new Set(ctx.user?.permissions ?? []);
    if (perms.some((p) => !own.has(p))) throw new ForbiddenException('No puede conceder permisos que no posee');
  }

  async update(id: string, b: RoleUpdate, ctx: RequestContext) {
    const [before] = await this.serialize(id);
    if (!before) throw new NotFoundException('Rol no encontrado');
    if (before.isSystem) throw new BadRequestException('Los roles de sistema no son editables');
    if (b.permissions) this.assertNoEscalation(b.permissions, ctx);
    await this.prisma.role.update({ where: { id }, data: { name: b.name, description: b.description } });
    if (b.permissions) {
      await this.setPermissions(id, b.permissions);
      // Invalida sesiones de usuarios con este rol para que los permisos se recarguen.
      await this.prisma.user.updateMany({ where: { roleId: id }, data: { tokenVersion: { increment: 1 } } });
    }
    const [after] = await this.serialize(id);
    await this.audit.log(ctx, { action: b.permissions ? 'role.permissions_change' : 'role.update', entity: 'Role', entityId: id, before, after });
    return after;
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}
  @Get() @RequirePermissions('roles.read')
  list() { return this.service.list(); }
  @Get('permissions') @RequirePermissions('roles.read')
  permissions() { return this.service.permissions(); }
  @Get(':id') @RequirePermissions('roles.read')
  get(@Param('id') id: string) { return this.service.get(id); }
  @Post() @RequirePermissions('roles.create')
  create(@Body(new ZodPipe(roleBody)) b: RoleBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Patch(':id') @RequirePermissions('roles.update')
  update(@Param('id') id: string, @Body(new ZodPipe(roleUpdate)) b: RoleUpdate, @Ctx() ctx: RequestContext) { return this.service.update(id, b, ctx); }
}

@Module({ controllers: [RolesController], providers: [RolesService] })
export class RolesModule {}
