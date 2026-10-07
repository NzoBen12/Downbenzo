import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContext } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { buildOrderBy, paginated } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { AgencyBody, AgencyQuery, AgencyUpdate } from './agencies.schemas';

@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: AgencyQuery, ctx: RequestContext): Prisma.AgencyWhereInput {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return {
      deletedAt: null,
      ...(scope.agencyId ? { id: scope.agencyId } : {}),
      ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
              { city: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async list(q: AgencyQuery, ctx: RequestContext) {
    const where = this.where(q, ctx);
    const [data, total] = await Promise.all([
      this.prisma.agency.findMany({
        where,
        orderBy: buildOrderBy(q.sortBy, q.sortDir, ['name', 'code', 'city', 'createdAt'], 'name'),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { managers: { where: { deletedAt: null } }, visits: { where: { deletedAt: null } } } } },
      }),
      this.prisma.agency.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  listAll(q: AgencyQuery, ctx: RequestContext) {
    return this.prisma.agency.findMany({ where: this.where(q, ctx), orderBy: { name: 'asc' }, take: 10_000 });
  }

  async get(id: string, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const agency = await this.prisma.agency.findFirst({
      where: { id, deletedAt: null, ...(scope.agencyId ? { id: scope.agencyId } : {}) },
      include: { managers: { where: { deletedAt: null }, orderBy: { fullName: 'asc' } } },
    });
    if (!agency) throw new NotFoundException('Agencia no encontrada');
    const visitsByStatus = await this.prisma.visit.groupBy({
      by: ['status'],
      where: { agencyId: id, deletedAt: null },
      _count: { _all: true },
    });
    const recentVisits = await this.prisma.visit.findMany({
      where: { agencyId: id, deletedAt: null },
      orderBy: { scheduledAt: 'desc' },
      take: 10,
      include: { manager: { select: { id: true, fullName: true } } },
    });
    const currency = await this.prisma.currencyOperation.aggregate({
      where: { agencyId: id, status: 'COMPLETED' },
      _count: { _all: true },
      _sum: { amount: true },
    });
    return {
      ...agency,
      metrics: {
        visitsByStatus: Object.fromEntries(visitsByStatus.map((v) => [v.status, v._count._all])),
        currencyOperations: currency._count._all,
        currencyAmount: currency._sum.amount?.toString() ?? '0',
      },
      recentVisits,
    };
  }

  async create(body: AgencyBody, ctx: RequestContext) {
    const created = await this.prisma.agency.create({ data: body });
    await this.audit.log(ctx, { action: 'agency.create', entity: 'Agency', entityId: created.id, after: created });
    return created;
  }

  async update(id: string, body: AgencyUpdate, ctx: RequestContext, action = 'agency.update') {
    const before = await this.prisma.agency.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Agencia no encontrada');
    const after = await this.prisma.agency.update({ where: { id }, data: body });
    await this.audit.log(ctx, { action, entity: 'Agency', entityId: id, before, after });
    return after;
  }

  setActive(id: string, isActive: boolean, ctx: RequestContext) {
    return this.update(id, { isActive }, ctx, isActive ? 'agency.activate' : 'agency.deactivate');
  }

  async remove(id: string, ctx: RequestContext) {
    const before = await this.prisma.agency.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Agencia no encontrada');
    await this.prisma.agency.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log(ctx, { action: 'agency.delete', entity: 'Agency', entityId: id, before });
  }
}
