import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { dateFilter, dateRangeSchema, paginated, paginationSchema } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const productBody = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  isDelta: z.boolean().default(false),
  isActive: z.boolean().optional(),
});
const productUpdate = productBody.partial();
const saleBody = z.object({
  productId: z.string().min(1),
  agencyId: z.string().min(1),
  managerId: z.string().min(1),
  visitId: z.string().min(1).optional().nullable(),
  customerId: z.string().min(1).optional().nullable(),
  sold: z.boolean().default(true),
  amount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  soldAt: z.coerce.date().default(() => new Date()),
});
const saleQuery = paginationSchema.merge(dateRangeSchema).extend({
  productId: z.string().optional(),
  agencyId: z.string().optional(),
  managerId: z.string().optional(),
  sold: z.enum(['true', 'false']).optional(),
});
type ProductBody = z.infer<typeof productBody>;
type ProductUpdate = z.infer<typeof productUpdate>;
type SaleBody = z.infer<typeof saleBody>;
type SaleQuery = z.infer<typeof saleQuery>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.product.findMany({ orderBy: { name: 'asc' } });
  }
  async create(b: ProductBody, ctx: RequestContext) {
    const created = await this.prisma.product.create({ data: b });
    await this.audit.log(ctx, { action: 'product.create', entity: 'Product', entityId: created.id, after: created });
    return created;
  }
  async update(id: string, b: ProductUpdate, ctx: RequestContext) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Producto no encontrado');
    const after = await this.prisma.product.update({ where: { id }, data: b });
    await this.audit.log(ctx, { action: 'product.update', entity: 'Product', entityId: id, before, after });
    return after;
  }

  async listSales(q: SaleQuery, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const where: Prisma.ProductSaleWhereInput = {
      soldAt: dateFilter(q.from, q.to),
      productId: q.productId,
      agencyId: scope.agencyId ?? q.agencyId,
      managerId: scope.managerId ?? q.managerId,
      ...(q.sold ? { sold: q.sold === 'true' } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.productSale.findMany({
        where,
        orderBy: { soldAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { product: true, agency: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } } },
      }),
      this.prisma.productSale.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async createSale(b: SaleBody, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    if (scope.managerId && scope.managerId !== b.managerId) throw new BadRequestException('Sólo puede registrar sus propias ventas');
    if (scope.agencyId && scope.agencyId !== b.agencyId) throw new BadRequestException('Agencia fuera de su alcance');
    const manager = await this.prisma.manager.findFirst({ where: { id: b.managerId, deletedAt: null } });
    if (!manager || manager.agencyId !== b.agencyId) throw new BadRequestException('El gestor no pertenece a la agencia indicada');
    const created = await this.prisma.productSale.create({ data: b });
    await this.audit.log(ctx, { action: 'sale.create', entity: 'ProductSale', entityId: created.id, after: created });
    return created;
  }
}

@Controller()
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get('products') @RequirePermissions('products.read')
  list() { return this.service.list(); }
  @Post('products') @RequirePermissions('products.create')
  create(@Body(new ZodPipe(productBody)) b: ProductBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Patch('products/:id') @RequirePermissions('products.update')
  update(@Param('id') id: string, @Body(new ZodPipe(productUpdate)) b: ProductUpdate, @Ctx() ctx: RequestContext) { return this.service.update(id, b, ctx); }

  @Get('sales') @RequirePermissions('sales.read')
  sales(@Query(new ZodPipe(saleQuery)) q: SaleQuery, @Ctx() ctx: RequestContext) { return this.service.listSales(q, ctx); }
  @Post('sales') @RequirePermissions('sales.create')
  createSale(@Body(new ZodPipe(saleBody)) b: SaleBody, @Ctx() ctx: RequestContext) { return this.service.createSale(b, ctx); }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
