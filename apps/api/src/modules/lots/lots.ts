import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, Post, Query, ConflictException } from '@nestjs/common';
import { LotStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { paginated, paginationSchema } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const LOT_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  CREATED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};
export const canLotTransition = (from: LotStatus, to: LotStatus) => LOT_TRANSITIONS[from].includes(to);

const lotBody = z.object({
  code: z.string().trim().min(1).max(30),
  quantity: z.coerce.number().int().min(1).max(100_000),
  agencyId: z.string().min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});
const lotStatusBody = z.object({ status: z.nativeEnum(LotStatus) });
const lotQuery = paginationSchema.extend({ status: z.nativeEnum(LotStatus).optional(), agencyId: z.string().optional() });
type LotBody = z.infer<typeof lotBody>;
type LotQuery = z.infer<typeof lotQuery>;

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: Partial<LotQuery>, ctx: RequestContext): Prisma.LotWhereInput {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return {
      status: q.status,
      agencyId: scope.agencyId ?? q.agencyId,
      ...(q.search ? { code: { contains: q.search, mode: 'insensitive' } } : {}),
    };
  }

  async list(q: LotQuery, ctx: RequestContext) {
    const where = this.where(q, ctx);
    const [data, total] = await Promise.all([
      this.prisma.lot.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { agency: { select: { id: true, name: true } }, _count: { select: { cards: true } } },
      }),
      this.prisma.lot.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: string, ctx: RequestContext) {
    const lot = await this.prisma.lot.findFirst({
      where: { id, ...this.where({}, ctx) },
      include: { agency: { select: { id: true, name: true } }, cards: { orderBy: { createdAt: 'desc' }, take: 100 } },
    });
    if (!lot) throw new NotFoundException('Lote no encontrado');
    const history = await this.prisma.auditLog.findMany({
      where: { entity: 'Lot', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, action: true, createdAt: true, before: true, after: true },
    });
    return { ...lot, history };
  }

  async create(b: LotBody, ctx: RequestContext) {
    const agency = await this.prisma.agency.findFirst({ where: { id: b.agencyId, deletedAt: null } });
    if (!agency) throw new BadRequestException('Agencia inexistente');
    const created = await this.prisma.lot.create({ data: b });
    await this.audit.log(ctx, { action: 'lot.create', entity: 'Lot', entityId: created.id, after: created });
    return created;
  }

  async setStatus(id: string, status: LotStatus, ctx: RequestContext) {
    const before = await this.prisma.lot.findFirst({ where: { id, ...this.where({}, ctx) } });
    if (!before) throw new NotFoundException('Lote no encontrado');
    if (!canLotTransition(before.status, status)) throw new ConflictException(`Transición no permitida: ${before.status} → ${status}`);
    const after = await this.prisma.lot.update({ where: { id }, data: { status } });
    await this.audit.log(ctx, { action: 'lot.status', entity: 'Lot', entityId: id, before, after });
    return after;
  }
}

@Controller('lots')
export class LotsController {
  constructor(private readonly service: LotsService) {}
  @Get() @RequirePermissions('lots.read')
  list(@Query(new ZodPipe(lotQuery)) q: LotQuery, @Ctx() ctx: RequestContext) { return this.service.list(q, ctx); }
  @Get(':id') @RequirePermissions('lots.read')
  get(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.get(id, ctx); }
  @Post() @RequirePermissions('lots.create')
  create(@Body(new ZodPipe(lotBody)) b: LotBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Post(':id/status') @HttpCode(200) @RequirePermissions('lots.update')
  status(@Param('id') id: string, @Body(new ZodPipe(lotStatusBody)) b: { status: LotStatus }, @Ctx() ctx: RequestContext) {
    return this.service.setStatus(id, b.status, ctx);
  }
}

@Module({ controllers: [LotsController], providers: [LotsService] })
export class LotsModule {}
