import { Injectable } from '@nestjs/common';
import { Prisma, VisitStatus } from '@prisma/client';
import { RequestContext } from '../../auth/auth.types';
import { dateFilter } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { rank, summarizeVisits } from './kpi';

export interface DashboardFilters {
  from?: Date;
  to?: Date;
  agencyId?: string;
  managerId?: string;
  status?: VisitStatus;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private scoped(f: DashboardFilters, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return { agencyId: scope.agencyId ?? f.agencyId, managerId: scope.managerId ?? f.managerId };
  }

  visitWhere(f: DashboardFilters, ctx: RequestContext): Prisma.VisitWhereInput {
    return { deletedAt: null, scheduledAt: dateFilter(f.from, f.to), status: f.status, ...this.scoped(f, ctx) };
  }

  async overview(f: DashboardFilters, ctx: RequestContext) {
    const s = this.scoped(f, ctx);
    const visitWhere = this.visitWhere(f, ctx);
    const saleWhere: Prisma.ProductSaleWhereInput = { soldAt: dateFilter(f.from, f.to), ...s };
    const currencyWhere: Prisma.CurrencyOperationWhereInput = { operatedAt: dateFilter(f.from, f.to), agencyId: s.agencyId };

    const [byStatus, sold, notSold, delta, amount, currency, mgrRows, agRows, trend] = await Promise.all([
      this.prisma.visit.groupBy({ by: ['status'], where: visitWhere, _count: { _all: true } }),
      this.prisma.productSale.count({ where: { ...saleWhere, sold: true } }),
      this.prisma.productSale.count({ where: { ...saleWhere, sold: false } }),
      this.prisma.productSale.count({ where: { ...saleWhere, sold: true, product: { isDelta: true } } }),
      this.prisma.productSale.aggregate({ where: { ...saleWhere, sold: true }, _sum: { amount: true } }),
      this.prisma.currencyOperation.groupBy({ by: ['currency'], where: { ...currencyWhere, status: 'COMPLETED' }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.visit.groupBy({ by: ['managerId', 'status'], where: visitWhere, _count: { _all: true } }),
      this.prisma.visit.groupBy({ by: ['agencyId', 'status'], where: visitWhere, _count: { _all: true } }),
      this.trend(visitWhere),
    ]);

    const [managers, agencies] = await Promise.all([
      this.prisma.manager.findMany({ where: { id: { in: [...new Set(mgrRows.map((r) => r.managerId))] } }, select: { id: true, fullName: true } }),
      this.prisma.agency.findMany({ where: { id: { in: [...new Set(agRows.map((r) => r.agencyId))] } }, select: { id: true, name: true } }),
    ]);
    const mName = new Map(managers.map((m) => [m.id, m.fullName]));
    const aName = new Map(agencies.map((a) => [a.id, a.name]));

    return {
      filters: { from: f.from ?? null, to: f.to ?? null, agencyId: s.agencyId ?? null, managerId: s.managerId ?? null, status: f.status ?? null },
      visits: summarizeVisits(byStatus.map((r) => ({ status: r.status, count: r._count._all }))),
      products: { sold, notSold, delta, totalAmount: amount._sum.amount?.toString() ?? '0' },
      currency: {
        operations: currency.reduce((a, c) => a + c._count._all, 0),
        byCurrency: currency.map((c) => ({ currency: c.currency, operations: c._count._all, amount: c._sum.amount?.toString() ?? '0' })),
      },
      rankings: {
        managers: rank(mgrRows.map((r) => ({ id: r.managerId, name: mName.get(r.managerId) ?? '—', status: r.status, count: r._count._all }))),
        agencies: rank(agRows.map((r) => ({ id: r.agencyId, name: aName.get(r.agencyId) ?? '—', status: r.status, count: r._count._all }))),
      },
      trend,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Visitas por día y estado. Los filtros Prisma se aplican cargando sólo (fecha, estado) para el rango. */
  private async trend(where: Prisma.VisitWhereInput) {
    const rows = await this.prisma.visit.findMany({ where, select: { scheduledAt: true, status: true }, take: 100_000 });
    const days = new Map<string, { date: string; total: number; successful: number }>();
    for (const r of rows) {
      const date = r.scheduledAt.toISOString().slice(0, 10);
      const d = days.get(date) ?? { date, total: 0, successful: 0 };
      d.total++;
      if (r.status === 'SUCCESSFUL') d.successful++;
      days.set(date, d);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
