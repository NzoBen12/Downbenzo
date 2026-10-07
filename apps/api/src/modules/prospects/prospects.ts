import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, ProspectStatus } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { buildOrderBy, paginated, paginationSchema } from '../../common/pagination';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const statusEnum = z.nativeEnum(ProspectStatus);
const prospectBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  status: statusEnum.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const prospectUpdate = prospectBody.partial();
const prospectQuery = paginationSchema.extend({ status: statusEnum.optional(), city: z.string().max(80).optional() });
type ProspectBody = z.infer<typeof prospectBody>;
type ProspectUpdate = z.infer<typeof prospectUpdate>;
type ProspectQuery = z.infer<typeof prospectQuery>;

@Injectable()
export class ProspectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ProspectQuery) {
    const where: Prisma.ProspectWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.search
        ? { OR: [{ fullName: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        orderBy: buildOrderBy(q.sortBy, q.sortDir, ['fullName', 'status', 'city', 'createdAt'], 'createdAt'),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { visits: { where: { deletedAt: null } } } } },
      }),
      this.prisma.prospect.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: string) {
    const p = await this.prisma.prospect.findFirst({
      where: { id, deletedAt: null },
      include: {
        visits: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: 'desc' },
          include: { manager: { select: { id: true, fullName: true } }, agency: { select: { id: true, name: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException('Prospecto no encontrado');
    return p;
  }

  async create(b: ProspectBody, ctx: RequestContext) {
    const created = await this.prisma.prospect.create({ data: b });
    await this.audit.log(ctx, { action: 'prospect.create', entity: 'Prospect', entityId: created.id, after: created });
    return created;
  }

  async update(id: string, b: ProspectUpdate, ctx: RequestContext) {
    const before = await this.prisma.prospect.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Prospecto no encontrado');
    const after = await this.prisma.prospect.update({ where: { id }, data: b });
    await this.audit.log(ctx, { action: 'prospect.update', entity: 'Prospect', entityId: id, before, after });
    return after;
  }

  async remove(id: string, ctx: RequestContext) {
    const before = await this.prisma.prospect.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Prospecto no encontrado');
    await this.prisma.prospect.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(ctx, { action: 'prospect.delete', entity: 'Prospect', entityId: id, before });
  }
}

@Controller('prospects')
export class ProspectsController {
  constructor(private readonly service: ProspectsService) {}

  @Get() @RequirePermissions('prospects.read')
  list(@Query(new ZodPipe(prospectQuery)) q: ProspectQuery) { return this.service.list(q); }
  @Get(':id') @RequirePermissions('prospects.read')
  get(@Param('id') id: string) { return this.service.get(id); }
  @Post() @RequirePermissions('prospects.create')
  create(@Body(new ZodPipe(prospectBody)) b: ProspectBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Patch(':id') @RequirePermissions('prospects.update')
  update(@Param('id') id: string, @Body(new ZodPipe(prospectUpdate)) b: ProspectUpdate, @Ctx() ctx: RequestContext) { return this.service.update(id, b, ctx); }
  @Delete(':id') @HttpCode(204) @RequirePermissions('prospects.delete')
  remove(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.remove(id, ctx); }
}

@Module({ controllers: [ProspectsController], providers: [ProspectsService], exports: [ProspectsService] })
export class ProspectsModule {}
