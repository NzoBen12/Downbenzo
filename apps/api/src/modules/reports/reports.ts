import { BadRequestException, Controller, Get, Injectable, Module, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { dateFilter } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { ExportColumn, ExportRow, ExportService } from '../../export/export.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardModule } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { dashboardQuery } from '../dashboard/dashboard.controller';

export const REPORT_TYPES = ['activity', 'visits', 'manager-performance', 'agency-performance', 'products', 'currency', 'prospects'] as const;
type ReportType = (typeof REPORT_TYPES)[number];
const reportQuery = dashboardQuery.extend({ format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json') });
type ReportQuery = z.infer<typeof reportQuery>;

interface Report { title: string; columns: ExportColumn[]; rows: ExportRow[] }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly dashboard: DashboardService) {}

  async build(type: ReportType, q: ReportQuery, ctx: RequestContext): Promise<Report> {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    switch (type) {
      case 'activity':
      case 'visits': {
        const d = await this.dashboard.overview(q, ctx);
        return {
          title: 'Actividad comercial',
          columns: [{ header: 'Indicador', key: 'k' }, { header: 'Valor', key: 'v' }],
          rows: [
            { k: 'Visitas totales', v: d.visits.total }, { k: 'Exitosas', v: d.visits.successful },
            { k: 'Sin éxito', v: d.visits.unsuccessful }, { k: 'Diferidas', v: d.visits.deferred },
            { k: 'Anuladas', v: d.visits.cancelled }, { k: 'Planificadas', v: d.visits.planned },
            { k: 'Tasa de éxito (%)', v: d.visits.successRate }, { k: 'Productos vendidos', v: d.products.sold },
            { k: 'Productos no vendidos', v: d.products.notSold }, { k: 'Productos DELTA', v: d.products.delta },
            { k: 'Importe productos', v: d.products.totalAmount }, { k: 'Operaciones de divisa', v: d.currency.operations },
          ],
        };
      }
      case 'manager-performance':
      case 'agency-performance': {
        const d = await this.dashboard.overview(q, ctx);
        const rows = type === 'manager-performance' ? d.rankings.managers : d.rankings.agencies;
        return {
          title: type === 'manager-performance' ? 'Rendimiento por gestor' : 'Rendimiento por agencia',
          columns: [{ header: 'Nombre', key: 'name' }, { header: 'Visitas', key: 'total' }, { header: 'Exitosas', key: 'successful' }, { header: 'Puntuación (%)', key: 'score' }],
          rows: rows.map((r) => ({ ...r })),
        };
      }
      case 'products': {
        const grouped = await this.prisma.productSale.groupBy({
          by: ['productId', 'sold'],
          where: { soldAt: dateFilter(q.from, q.to), agencyId: scope.agencyId ?? q.agencyId, managerId: scope.managerId ?? q.managerId },
          _count: { _all: true }, _sum: { amount: true },
        });
        const products = await this.prisma.product.findMany();
        const name = new Map(products.map((p) => [p.id, p.name]));
        return {
          title: 'Productos',
          columns: [{ header: 'Producto', key: 'product' }, { header: 'Vendido', key: 'sold' }, { header: 'Operaciones', key: 'count' }, { header: 'Importe', key: 'amount' }],
          rows: grouped.map((g) => ({ product: name.get(g.productId) ?? '—', sold: g.sold ? 'Sí' : 'No', count: g._count._all, amount: g._sum.amount?.toString() ?? '0' })),
        };
      }
      case 'currency': {
        const grouped = await this.prisma.currencyOperation.groupBy({
          by: ['currency', 'status'],
          where: { operatedAt: dateFilter(q.from, q.to), agencyId: scope.agencyId ?? q.agencyId },
          _count: { _all: true }, _sum: { amount: true },
        });
        return {
          title: 'Cambio de divisas',
          columns: [{ header: 'Moneda', key: 'currency' }, { header: 'Estado', key: 'status' }, { header: 'Operaciones', key: 'count' }, { header: 'Importe', key: 'amount' }],
          rows: grouped.map((g) => ({ currency: g.currency, status: g.status, count: g._count._all, amount: g._sum.amount?.toString() ?? '0' })),
        };
      }
      case 'prospects': {
        const grouped = await this.prisma.prospect.groupBy({ by: ['status'], where: { deletedAt: null, createdAt: dateFilter(q.from, q.to) }, _count: { _all: true } });
        return {
          title: 'Prospectos',
          columns: [{ header: 'Estado', key: 'status' }, { header: 'Total', key: 'count' }],
          rows: grouped.map((g) => ({ status: g.status, count: g._count._all })),
        };
      }
    }
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService, private readonly exporter: ExportService) {}

  @Get(':type') @RequirePermissions('reports.read')
  async report(@Param('type') type: string, @Query(new ZodPipe(reportQuery)) q: ReportQuery, @Ctx() ctx: RequestContext, @Res() res: Response) {
    if (!(REPORT_TYPES as readonly string[]).includes(type)) throw new BadRequestException('Tipo de informe desconocido');
    const report = await this.service.build(type as ReportType, q, ctx);
    if (q.format === 'json') {
      res.json({ title: report.title, columns: report.columns, rows: report.rows });
      return;
    }
    if (!ctx.user?.permissions.includes('reports.export')) {
      res.status(403).json({ statusCode: 403, message: 'No tiene permiso para exportar' });
      return;
    }
    await this.exporter.send(res, q.format, type, report.columns, report.rows);
  }
}

@Module({ imports: [DashboardModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
