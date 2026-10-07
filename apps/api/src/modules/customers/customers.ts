import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { paginated, paginationSchema } from '../../common/pagination';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const customerBody = z.object({
  code: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});
const customerUpdate = customerBody.partial();
type CustomerBody = z.infer<typeof customerBody>;
type CustomerUpdate = z.infer<typeof customerUpdate>;
type Q = z.infer<typeof paginationSchema>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: Q) {
    const where = q.search
      ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' as const } }, { code: { contains: q.search, mode: 'insensitive' as const } }] }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { fullName: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }
  async create(b: CustomerBody, ctx: RequestContext) {
    const created = await this.prisma.customer.create({ data: b });
    await this.audit.log(ctx, { action: 'customer.create', entity: 'Customer', entityId: created.id, after: created });
    return created;
  }
  async update(id: string, b: CustomerUpdate, ctx: RequestContext) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Cliente no encontrado');
    const after = await this.prisma.customer.update({ where: { id }, data: b });
    await this.audit.log(ctx, { action: 'customer.update', entity: 'Customer', entityId: id, before, after });
    return after;
  }
}

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}
  @Get() @RequirePermissions('customers.read')
  list(@Query(new ZodPipe(paginationSchema)) q: Q) { return this.service.list(q); }
  @Post() @RequirePermissions('customers.create')
  create(@Body(new ZodPipe(customerBody)) b: CustomerBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Patch(':id') @RequirePermissions('customers.update')
  update(@Param('id') id: string, @Body(new ZodPipe(customerUpdate)) b: CustomerUpdate, @Ctx() ctx: RequestContext) { return this.service.update(id, b, ctx); }
}

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}
