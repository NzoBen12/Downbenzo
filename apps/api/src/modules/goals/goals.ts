import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ActionStatus, GoalStatus } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { dataScope } from '../../common/scope';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const goalBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  targetValue: z.coerce.number().positive(),
  currentValue: z.coerce.number().min(0).default(0),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  agencyId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  status: z.nativeEnum(GoalStatus).optional(),
}).refine((g) => g.periodEnd >= g.periodStart, { message: 'El fin del periodo debe ser posterior al inicio', path: ['periodEnd'] });
const goalUpdate = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  targetValue: z.coerce.number().positive().optional(),
  currentValue: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(GoalStatus).optional(),
});
const actionBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  managerId: z.string().optional().nullable(),
});
const actionUpdate = z.object({ status: z.nativeEnum(ActionStatus).optional(), title: z.string().trim().min(1).max(160).optional(), dueDate: z.coerce.date().optional().nullable() });
type GoalBody = z.infer<typeof goalBody>;
type GoalUpdate = z.infer<typeof goalUpdate>;
type ActionBody = z.infer<typeof actionBody>;
type ActionUpdate = z.infer<typeof actionUpdate>;

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  listGoals(ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return this.prisma.goal.findMany({
      where: {
        ...(scope.agencyId ? { OR: [{ agencyId: scope.agencyId }, { agencyId: null, managerId: null }] } : {}),
      },
      orderBy: { periodEnd: 'desc' },
      include: { agency: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true } }, product: { select: { id: true, name: true } } },
      take: 500,
    });
  }
  async createGoal(b: GoalBody, ctx: RequestContext) {
    const created = await this.prisma.goal.create({ data: b });
    await this.audit.log(ctx, { action: 'goal.create', entity: 'Goal', entityId: created.id, after: created });
    return created;
  }
  async updateGoal(id: string, b: GoalUpdate, ctx: RequestContext) {
    const before = await this.prisma.goal.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Objetivo no encontrado');
    const after = await this.prisma.goal.update({ where: { id }, data: b });
    await this.audit.log(ctx, { action: 'goal.update', entity: 'Goal', entityId: id, before, after });
    return after;
  }
  listActions(ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return this.prisma.action.findMany({
      where: scope.managerId ? { managerId: scope.managerId } : {},
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: { manager: { select: { id: true, fullName: true } } },
      take: 500,
    });
  }
  async createAction(b: ActionBody, ctx: RequestContext) {
    const created = await this.prisma.action.create({ data: b });
    await this.audit.log(ctx, { action: 'action.create', entity: 'Action', entityId: created.id, after: created });
    return created;
  }
  async updateAction(id: string, b: ActionUpdate, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    const before = await this.prisma.action.findFirst({ where: { id, ...(scope.managerId ? { managerId: scope.managerId } : {}) } });
    if (!before) throw new NotFoundException('Acción no encontrada');
    const after = await this.prisma.action.update({ where: { id }, data: b });
    await this.audit.log(ctx, { action: 'action.update', entity: 'Action', entityId: id, before, after });
    return after;
  }
}

@Controller()
export class GoalsController {
  constructor(private readonly service: GoalsService) {}
  @Get('goals') @RequirePermissions('goals.read')
  goals(@Ctx() ctx: RequestContext) { return this.service.listGoals(ctx); }
  @Post('goals') @RequirePermissions('goals.create')
  createGoal(@Body(new ZodPipe(goalBody)) b: GoalBody, @Ctx() ctx: RequestContext) { return this.service.createGoal(b, ctx); }
  @Patch('goals/:id') @RequirePermissions('goals.update')
  updateGoal(@Param('id') id: string, @Body(new ZodPipe(goalUpdate)) b: GoalUpdate, @Ctx() ctx: RequestContext) { return this.service.updateGoal(id, b, ctx); }
  @Get('actions') @RequirePermissions('actions.read')
  actions(@Ctx() ctx: RequestContext) { return this.service.listActions(ctx); }
  @Post('actions') @RequirePermissions('actions.create')
  createAction(@Body(new ZodPipe(actionBody)) b: ActionBody, @Ctx() ctx: RequestContext) { return this.service.createAction(b, ctx); }
  @Patch('actions/:id') @RequirePermissions('actions.update')
  updateAction(@Param('id') id: string, @Body(new ZodPipe(actionUpdate)) b: ActionUpdate, @Ctx() ctx: RequestContext) { return this.service.updateAction(id, b, ctx); }
}

@Module({ controllers: [GoalsController], providers: [GoalsService] })
export class GoalsModule {}
