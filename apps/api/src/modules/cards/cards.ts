import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CardMovementType, CardStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { paginated, paginationSchema } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Nunca se almacena el PAN completo: sólo PAN enmascarado (p. ej. 4111 **** **** 1111).
 * La integración con el sistema corporativo de tarjetas queda pendiente (ver docs/architecture.md).
 */
export const maskedPanRegex = /^\d{4}[ -]?[*Xx]{4}[ -]?[*Xx]{4}[ -]?\d{4}$/;

const MOVEMENT_RULES: Record<CardMovementType, { from: CardStatus[]; to: CardStatus; needsAgency?: boolean }> = {
  ENTRY: { from: [], to: 'IN_STOCK' },
  DISTRIBUTION: { from: ['IN_STOCK'], to: 'DISTRIBUTED', needsAgency: true },
  ACTIVATION: { from: ['DISTRIBUTED'], to: 'ACTIVE' },
  BLOCK: { from: ['ACTIVE'], to: 'BLOCKED' },
  CANCELLATION: { from: ['IN_STOCK', 'DISTRIBUTED', 'ACTIVE', 'BLOCKED'], to: 'CANCELLED' },
};
export const nextCardStatus = (current: CardStatus, type: CardMovementType): CardStatus | null => {
  const rule = MOVEMENT_RULES[type];
  return rule.from.includes(current) ? rule.to : null;
};

const cardBody = z.object({
  maskedPan: z.string().trim().regex(maskedPanRegex, 'Se requiere PAN enmascarado (nunca el número completo)'),
  reference: z.string().trim().min(1).max(40),
  lotId: z.string().min(1).optional().nullable(),
});
const movementBody = z.object({
  type: z.nativeEnum(CardMovementType),
  agencyId: z.string().min(1).optional(),
  note: z.string().trim().max(300).optional().nullable(),
});
const cardQuery = paginationSchema.extend({
  status: z.nativeEnum(CardStatus).optional(), agencyId: z.string().optional(), lotId: z.string().optional(),
});
const movementQuery = paginationSchema.extend({ cardId: z.string().optional(), type: z.nativeEnum(CardMovementType).optional() });
type CardBody = z.infer<typeof cardBody>;
type MovementBody = z.infer<typeof movementBody>;
type CardQuery = z.infer<typeof cardQuery>;
type MovementQuery = z.infer<typeof movementQuery>;

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private where(q: Partial<CardQuery>, ctx: RequestContext): Prisma.CardWhereInput {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return {
      status: q.status, lotId: q.lotId,
      agencyId: scope.agencyId ?? q.agencyId,
      ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { maskedPan: { contains: q.search } }] } : {}),
    };
  }

  async list(q: CardQuery, ctx: RequestContext) {
    const where = this.where(q, ctx);
    const [data, total] = await Promise.all([
      this.prisma.card.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { agency: { select: { id: true, name: true } }, lot: { select: { id: true, code: true } } },
      }),
      this.prisma.card.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: string, ctx: RequestContext) {
    const card = await this.prisma.card.findFirst({
      where: { id, ...this.where({}, ctx) },
      include: { agency: { select: { id: true, name: true } }, lot: { select: { id: true, code: true } }, movements: { orderBy: { occurredAt: 'desc' } } },
    });
    if (!card) throw new NotFoundException('Tarjeta no encontrada');
    return card;
  }

  async create(b: CardBody, ctx: RequestContext) {
    const created = await this.prisma.$transaction(async (tx) => {
      const card = await tx.card.create({ data: b });
      await tx.cardMovement.create({ data: { cardId: card.id, type: 'ENTRY', actorId: ctx.user?.id } });
      return card;
    });
    await this.audit.log(ctx, { action: 'card.create', entity: 'Card', entityId: created.id, after: created });
    return created;
  }

  async addMovement(id: string, b: MovementBody, ctx: RequestContext) {
    const before = await this.prisma.card.findFirst({ where: { id, ...this.where({}, ctx) } });
    if (!before) throw new NotFoundException('Tarjeta no encontrada');
    const next = nextCardStatus(before.status, b.type);
    if (!next) throw new ConflictException(`Movimiento ${b.type} no permitido desde ${before.status}`);
    if (MOVEMENT_RULES[b.type].needsAgency && !b.agencyId) throw new BadRequestException('La distribución requiere agencia destino');
    const after = await this.prisma.$transaction(async (tx) => {
      await tx.cardMovement.create({ data: { cardId: id, type: b.type, note: b.note, actorId: ctx.user?.id } });
      return tx.card.update({ where: { id }, data: { status: next, ...(b.agencyId ? { agencyId: b.agencyId } : {}) } });
    });
    await this.audit.log(ctx, { action: `card.${b.type.toLowerCase()}`, entity: 'Card', entityId: id, before, after });
    return after;
  }

  async movements(q: MovementQuery, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const where: Prisma.CardMovementWhereInput = {
      cardId: q.cardId, type: q.type,
      ...(scope.agencyId ? { card: { agencyId: scope.agencyId } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.cardMovement.findMany({
        where, orderBy: { occurredAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { card: { select: { id: true, reference: true, maskedPan: true } } },
      }),
      this.prisma.cardMovement.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  async distribution(ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const rows = await this.prisma.card.groupBy({
      by: ['agencyId', 'status'],
      where: scope.agencyId ? { agencyId: scope.agencyId } : {},
      _count: { _all: true },
    });
    const agencies = await this.prisma.agency.findMany({ select: { id: true, name: true } });
    const names = new Map(agencies.map((a) => [a.id, a.name]));
    const out = new Map<string, { agencyId: string | null; agency: string; byStatus: Record<string, number> }>();
    for (const r of rows) {
      const key = r.agencyId ?? 'none';
      const entry = out.get(key) ?? { agencyId: r.agencyId, agency: r.agencyId ? (names.get(r.agencyId) ?? '—') : 'Sin asignar', byStatus: {} };
      entry.byStatus[r.status] = r._count._all;
      out.set(key, entry);
    }
    return [...out.values()];
  }
}

@Controller('cards')
export class CardsController {
  constructor(private readonly service: CardsService) {}
  @Get() @RequirePermissions('cards.read')
  list(@Query(new ZodPipe(cardQuery)) q: CardQuery, @Ctx() ctx: RequestContext) { return this.service.list(q, ctx); }
  @Get('distribution') @RequirePermissions('cards.read')
  distribution(@Ctx() ctx: RequestContext) { return this.service.distribution(ctx); }
  @Get('movements') @RequirePermissions('cards.read')
  movements(@Query(new ZodPipe(movementQuery)) q: MovementQuery, @Ctx() ctx: RequestContext) { return this.service.movements(q, ctx); }
  @Get(':id') @RequirePermissions('cards.read')
  get(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.get(id, ctx); }
  @Post() @RequirePermissions('cards.create')
  create(@Body(new ZodPipe(cardBody)) b: CardBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }
  @Post(':id/movements') @HttpCode(201) @RequirePermissions('cards.update')
  movement(@Param('id') id: string, @Body(new ZodPipe(movementBody)) b: MovementBody, @Ctx() ctx: RequestContext) { return this.service.addMovement(id, b, ctx); }
}

@Module({ controllers: [CardsController], providers: [CardsService] })
export class CardsModule {}
