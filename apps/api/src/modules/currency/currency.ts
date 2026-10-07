import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { CurrencyOperationStatus, Prisma } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { dateFilter, dateRangeSchema, paginated, paginationSchema } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { ExportFormat, ExportService, exportFormatSchema } from '../../export/export.service';
import { PrismaService } from '../../prisma/prisma.service';

const statusEnum = z.nativeEnum(CurrencyOperationStatus);
const opBody = z.object({
  operatedAt: z.coerce.date().default(() => new Date()),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Código ISO-4217 de 3 letras'),
  amount: z.coerce.number().positive().max(1_000_000_000),
  rate: z.coerce.number().positive().optional().nullable(),
  agencyId: z.string().min(1),
  managerId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
});
const opUpdate = z.object({ status: statusEnum });
const opQuery = paginationSchema.merge(dateRangeSchema).extend({
  currency: z.string().length(3).toUpperCase().optional(),
  status: statusEnum.optional(),
  agencyId: z.string().optional(),
});
const opExport = opQuery.extend({ format: exportFormatSchema });
type OpBody = z.infer<typeof opBody>;
type OpQuery = z.infer<typeof opQuery>;

@Injectable()
export class CurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: Partial<OpQuery>, ctx: RequestContext): Prisma.CurrencyOperationWhereInput {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return {
      operatedAt: dateFilter(q.from, q.to),
      currency: q.currency,
      status: q.status,
      agencyId: scope.agencyId ?? q.agencyId,
    };
  }

  async list(q: OpQuery, ctx: RequestContext) {
    const where = this.where(q, ctx);
    const [data, total, stats] = await Promise.all([
      this.prisma.currencyOperation.findMany({
        where,
        orderBy: { operatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { agency: { select: { id: true, name: true } } },
      }),
      this.prisma.currencyOperation.count({ where }),
      this.prisma.currencyOperation.groupBy({ by: ['currency'], where, _count: { _all: true }, _sum: { amount: true } }),
    ]);
    return {
      ...paginated(data, total, q.page, q.pageSize),
      stats: stats.map((s) => ({ currency: s.currency, operations: s._count._all, amount: s._sum.amount?.toString() ?? '0' })),
    };
  }

  listAll(q: OpQuery, ctx: RequestContext) {
    return this.prisma.currencyOperation.findMany({
      where: this.where(q, ctx),
      orderBy: { operatedAt: 'desc' },
      include: { agency: { select: { name: true } } },
      take: 50_000,
    });
  }

  async create(b: OpBody, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    if (scope.agencyId && scope.agencyId !== b.agencyId) throw new BadRequestException('Agencia fuera de su alcance');
    const created = await this.prisma.currencyOperation.create({ data: b });
    await this.audit.log(ctx, { action: 'currency.create', entity: 'CurrencyOperation', entityId: created.id, after: created });
    return created;
  }

  async setStatus(id: string, status: CurrencyOperationStatus, ctx: RequestContext) {
    const before = await this.prisma.currencyOperation.findFirst({ where: { id, ...this.where({}, ctx) } });
    if (!before) throw new NotFoundException('Operación no encontrada');
    if (before.status !== 'PENDING') throw new BadRequestException('Sólo las operaciones pendientes pueden cambiar de estado');
    const after = await this.prisma.currencyOperation.update({ where: { id }, data: { status } });
    await this.audit.log(ctx, { action: 'currency.status', entity: 'CurrencyOperation', entityId: id, before, after });
    return after;
  }
}

@Controller('currency-operations')
export class CurrencyController {
  constructor(
    private readonly service: CurrencyService,
    private readonly exporter: ExportService,
  ) {}

  @Get() @RequirePermissions('currency.read')
  list(@Query(new ZodPipe(opQuery)) q: OpQuery, @Ctx() ctx: RequestContext) { return this.service.list(q, ctx); }

  @Get('export') @RequirePermissions('currency.read', 'reports.export')
  async export(@Query(new ZodPipe(opExport)) q: OpQuery & { format: ExportFormat }, @Ctx() ctx: RequestContext, @Res() res: Response) {
    const rows = await this.service.listAll(q, ctx);
    await this.exporter.send(res, q.format, 'divisas', [
      { header: 'Fecha', key: 'operatedAt' }, { header: 'Agencia', key: 'agency' }, { header: 'Moneda', key: 'currency' },
      { header: 'Importe', key: 'amount' }, { header: 'Cambio', key: 'rate' }, { header: 'Estado', key: 'status' },
    ], rows.map((r) => ({ operatedAt: r.operatedAt, agency: r.agency.name, currency: r.currency, amount: r.amount.toString(), rate: r.rate?.toString(), status: r.status })));
  }

  @Post() @RequirePermissions('currency.create')
  create(@Body(new ZodPipe(opBody)) b: OpBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }

  @Patch(':id') @RequirePermissions('currency.update')
  update(@Param('id') id: string, @Body(new ZodPipe(opUpdate)) b: { status: CurrencyOperationStatus }, @Ctx() ctx: RequestContext) {
    return this.service.setStatus(id, b.status, ctx);
  }
}

@Module({ controllers: [CurrencyController], providers: [CurrencyService] })
export class CurrencyModule {}
