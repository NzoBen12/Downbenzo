import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { buildOrderBy, paginated, paginationSchema } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const managerBody = z.object({
  code: z.string().trim().min(1).max(20),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  agencyId: z.string().min(1),
  userId: z.string().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
});
const managerUpdate = managerBody.partial();
const managerQuery = paginationSchema.extend({
  agencyId: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
type ManagerBody = z.infer<typeof managerBody>;
type ManagerUpdate = z.infer<typeof managerUpdate>;
type ManagerQuery = z.infer<typeof managerQuery>;

/** Puntuación = % de visitas resueltas que fueron exitosas (excluye planificadas, diferidas y anuladas). */
export function managerScore(successful: number, unsuccessful: number): number {
  const resolved = successful + unsuccessful;
  return resolved === 0 ? 0 : Math.round((successful / resolved) * 1000) / 10;
}

@Injectable()
export class ManagersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ManagerQuery, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const where: Prisma.ManagerWhereInput = {
      deletedAt: null,
      ...(scope.agencyId ? { agencyId: scope.agencyId } : q.agencyId ? { agencyId: q.agencyId } : {}),
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.search
        ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.manager.findMany({
        where,
        orderBy: buildOrderBy(q.sortBy, q.sortDir, ['fullName', 'code', 'createdAt'], 'fullName'),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { agency: { select: { id: true, name: true } } },
      }),
      this.prisma.manager.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: string, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const manager = await this.prisma.manager.findFirst({
      where: { id, deletedAt: null, ...(scope.agencyId ? { agencyId: scope.agencyId } : {}) },
      include: { agency: { select: { id: true, name: true } }, goals: { orderBy: { periodEnd: 'desc' }, take: 10 } },
    });
    if (!manager) throw new NotFoundException('Gestor no encontrado');
    const grouped = await this.prisma.visit.groupBy({
      by: ['status'],
      where: { managerId: id, deletedAt: null },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    const recentVisits = await this.prisma.visit.findMany({
      where: { managerId: id, deletedAt: null },
      orderBy: { scheduledAt: 'desc' },
      take: 10,
      include: { agency: { select: { id: true, name: true } } },
    });
    return {
      ...manager,
      metrics: { visitsByStatus: byStatus, score: managerScore(byStatus.SUCCESSFUL ?? 0, byStatus.UNSUCCESSFUL ?? 0) },
      recentVisits,
    };
  }

  private async assertAgency(agencyId: string) {
    const a = await this.prisma.agency.findFirst({ where: { id: agencyId, deletedAt: null } });
    if (!a) throw new BadRequestException('La agencia indicada no existe');
  }

  async create(body: ManagerBody, ctx: RequestContext) {
    await this.assertAgency(body.agencyId);
    const created = await this.prisma.manager.create({ data: body });
    await this.audit.log(ctx, { action: 'manager.create', entity: 'Manager', entityId: created.id, after: created });
    return created;
  }

  async update(id: string, body: ManagerUpdate, ctx: RequestContext) {
    const before = await this.prisma.manager.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Gestor no encontrado');
    if (body.agencyId) await this.assertAgency(body.agencyId);
    const after = await this.prisma.manager.update({ where: { id }, data: body });
    await this.audit.log(ctx, { action: 'manager.update', entity: 'Manager', entityId: id, before, after });
    return after;
  }

  async remove(id: string, ctx: RequestContext) {
    const before = await this.prisma.manager.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Gestor no encontrado');
    await this.prisma.manager.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log(ctx, { action: 'manager.delete', entity: 'Manager', entityId: id, before });
  }
}

@Controller('managers')
export class ManagersController {
  constructor(private readonly service: ManagersService) {}

  @Get() @RequirePermissions('managers.read')
  list(@Query(new ZodPipe(managerQuery)) q: ManagerQuery, @Ctx() ctx: RequestContext) {
    return this.service.list(q, ctx);
  }
  @Get(':id') @RequirePermissions('managers.read')
  get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.get(id, ctx);
  }
  @Post() @RequirePermissions('managers.create')
  create(@Body(new ZodPipe(managerBody)) b: ManagerBody, @Ctx() ctx: RequestContext) {
    return this.service.create(b, ctx);
  }
  @Patch(':id') @RequirePermissions('managers.update')
  update(@Param('id') id: string, @Body(new ZodPipe(managerUpdate)) b: ManagerUpdate, @Ctx() ctx: RequestContext) {
    return this.service.update(id, b, ctx);
  }
  @Delete(':id') @HttpCode(204) @RequirePermissions('managers.delete')
  remove(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.remove(id, ctx);
  }
}

@Module({ controllers: [ManagersController], providers: [ManagersService], exports: [ManagersService] })
export class ManagersModule {}
