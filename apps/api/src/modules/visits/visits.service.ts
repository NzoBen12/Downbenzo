import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { buildOrderBy, dateFilter, paginated } from '../../common/pagination';
import { dataScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_SERVICE, NotificationService } from '../notifications/notification.tokens';
import { CalendarQuery, ReassignBody, VisitBody, VisitQuery, VisitStatusBody, VisitUpdate } from './visits.schemas';
import { canTransition, isEditable } from './visit.rules';

const include = {
  agency: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true, userId: true } },
  prospect: { select: { id: true, fullName: true } },
  customer: { select: { id: true, fullName: true } },
} satisfies Prisma.VisitInclude;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  buildWhere(q: Partial<VisitQuery> & CalendarQuerySubset, ctx: RequestContext): Prisma.VisitWhereInput {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    return {
      deletedAt: null,
      scheduledAt: dateFilter(q.from, q.to),
      ...(q.status ? { status: q.status } : {}),
      agencyId: scope.agencyId ?? q.agencyId,
      managerId: scope.managerId ?? q.managerId,
      ...(q.prospectId ? { prospectId: q.prospectId } : {}),
      ...('search' in q && q.search
        ? {
            OR: [
              { notes: { contains: q.search, mode: 'insensitive' } },
              { prospect: { fullName: { contains: q.search, mode: 'insensitive' } } },
              { customer: { fullName: { contains: q.search, mode: 'insensitive' } } },
              { manager: { fullName: { contains: q.search, mode: 'insensitive' } } },
              { agency: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async list(q: VisitQuery, ctx: RequestContext) {
    const where = this.buildWhere(q, ctx);
    const [data, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include,
        orderBy: buildOrderBy(q.sortBy, q.sortDir, ['scheduledAt', 'status', 'createdAt'], 'scheduledAt'),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.visit.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }

  listAll(q: VisitQuery, ctx: RequestContext) {
    return this.prisma.visit.findMany({
      where: this.buildWhere(q, ctx),
      include,
      orderBy: { scheduledAt: 'desc' },
      take: 50_000,
    });
  }

  calendar(q: CalendarQuery, ctx: RequestContext) {
    return this.prisma.visit.findMany({
      where: this.buildWhere(q, ctx),
      include,
      orderBy: { scheduledAt: 'asc' },
      take: 2000,
    });
  }

  async get(id: string, ctx: RequestContext) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, ...this.buildWhere({}, ctx) },
      include: { ...include, sales: { include: { product: true } } },
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    const history = await this.prisma.auditLog.findMany({
      where: { entity: 'Visit', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, createdAt: true, result: true, user: { select: { fullName: true } } },
    });
    return { ...visit, history };
  }

  /** Reglas de integridad: el gestor pertenece a la agencia; el gestor sólo agenda para sí mismo. */
  private async validateRefs(agencyId: string, managerId: string, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    if (scope.agencyId && scope.agencyId !== agencyId) throw new ForbiddenException('Agencia fuera de su alcance');
    if (scope.managerId && scope.managerId !== managerId) throw new ForbiddenException('Sólo puede gestionar sus propias visitas');
    const manager = await this.prisma.manager.findFirst({ where: { id: managerId, deletedAt: null, isActive: true } });
    if (!manager) throw new BadRequestException('Gestor inexistente o inactivo');
    if (manager.agencyId !== agencyId) throw new BadRequestException('El gestor no pertenece a la agencia indicada');
    const agency = await this.prisma.agency.findFirst({ where: { id: agencyId, deletedAt: null, isActive: true } });
    if (!agency) throw new BadRequestException('Agencia inexistente o inactiva');
    return manager;
  }

  async create(b: VisitBody, ctx: RequestContext) {
    const manager = await this.validateRefs(b.agencyId, b.managerId, ctx);
    if (b.prospectId && !(await this.prisma.prospect.findFirst({ where: { id: b.prospectId, deletedAt: null } }))) {
      throw new BadRequestException('Prospecto inexistente');
    }
    if (b.customerId && !(await this.prisma.customer.findUnique({ where: { id: b.customerId } }))) {
      throw new BadRequestException('Cliente inexistente');
    }
    const created = await this.prisma.visit.create({ data: b, include });
    await this.audit.log(ctx, { action: 'visit.create', entity: 'Visit', entityId: created.id, after: created });
    if (manager.userId && manager.userId !== ctx.user?.id) {
      await this.notifications.notify({
        userId: manager.userId,
        type: 'visit.assigned',
        title: 'Nueva visita asignada',
        link: `/visits/${created.id}`,
      });
    }
    return created;
  }

  private async findEditable(id: string, ctx: RequestContext) {
    const visit = await this.prisma.visit.findFirst({ where: { id, ...this.buildWhere({}, ctx) } });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    return visit;
  }

  async update(id: string, b: VisitUpdate, ctx: RequestContext) {
    const before = await this.findEditable(id, ctx);
    if (!isEditable(before.status)) throw new ConflictException('La visita ya está cerrada y no puede modificarse');
    await this.validateRefs(b.agencyId ?? before.agencyId, b.managerId ?? before.managerId, ctx);
    const after = await this.prisma.visit.update({ where: { id }, data: b, include });
    const rescheduled = b.scheduledAt && b.scheduledAt.getTime() !== before.scheduledAt.getTime();
    await this.audit.log(ctx, { action: rescheduled ? 'visit.reschedule' : 'visit.update', entity: 'Visit', entityId: id, before, after });
    return after;
  }

  async changeStatus(id: string, b: VisitStatusBody, ctx: RequestContext) {
    const before = await this.findEditable(id, ctx);
    if (!canTransition(before.status, b.status)) {
      throw new ConflictException(`Transición no permitida: ${before.status} → ${b.status}`);
    }
    if (b.status === 'PLANNED' && b.newScheduledAt && b.newScheduledAt <= new Date()) {
      throw new BadRequestException('La nueva fecha debe ser futura');
    }
    const after = await this.prisma.visit.update({
      where: { id },
      data: {
        status: b.status,
        result: b.result ?? before.result,
        ...(b.newScheduledAt ? { scheduledAt: b.newScheduledAt } : {}),
      },
      include,
    });
    const action = { PLANNED: 'visit.reschedule', DEFERRED: 'visit.defer', CANCELLED: 'visit.cancel' }[b.status as string] ?? 'visit.close';
    await this.audit.log(ctx, { action, entity: 'Visit', entityId: id, before, after });
    if (after.manager.userId && after.manager.userId !== ctx.user?.id && ['PLANNED', 'DEFERRED', 'CANCELLED'].includes(b.status)) {
      await this.notifications.notify({
        userId: after.manager.userId,
        type: 'visit.changed',
        title: b.status === 'CANCELLED' ? 'Visita anulada' : 'Visita reprogramada',
        link: `/visits/${id}`,
      });
    }
    return after;
  }

  /**
   * Reasignación en bloque, atómica: todas las visitas deben estar abiertas, en el alcance del usuario y
   * pertenecer a la agencia del nuevo gestor. Un Gestor/a (alcance propio) no puede reasignar.
   */
  async reassign(b: ReassignBody, ctx: RequestContext) {
    const scope = ctx.user ? dataScope(ctx.user) : {};
    if (scope.managerId) throw new ForbiddenException('Su rol no permite reasignar visitas');
    const ids = [...new Set(b.visitIds)];
    const target = await this.prisma.manager.findFirst({ where: { id: b.managerId, deletedAt: null, isActive: true } });
    if (!target) throw new BadRequestException('Gestor destino inexistente o inactivo');
    const visits = await this.prisma.visit.findMany({ where: { id: { in: ids }, ...this.buildWhere({}, ctx) } });
    if (visits.length !== ids.length) throw new NotFoundException('Alguna visita no existe o está fuera de su alcance');
    const closed = visits.filter((v) => !isEditable(v.status));
    if (closed.length) throw new ConflictException(`${closed.length} visita(s) ya cerradas no pueden reasignarse`);
    if (visits.some((v) => v.agencyId !== target.agencyId)) throw new BadRequestException('El gestor destino no pertenece a la agencia de todas las visitas');

    const toMove = visits.filter((v) => v.managerId !== target.id);
    await this.prisma.visit.updateMany({ where: { id: { in: toMove.map((v) => v.id) } }, data: { managerId: target.id } });
    for (const v of toMove) {
      await this.audit.log(ctx, { action: 'visit.reassign', entity: 'Visit', entityId: v.id, before: { managerId: v.managerId }, after: { managerId: target.id } });
    }
    if (target.userId && toMove.length > 0 && target.userId !== ctx.user?.id) {
      await this.notifications.notify({ userId: target.userId, type: 'visit.assigned', title: `${toMove.length} visita(s) reasignada(s) a usted`, link: '/visits' });
    }
    return { moved: toMove.length, unchanged: visits.length - toMove.length };
  }

  async remove(id: string, ctx: RequestContext) {
    const before = await this.findEditable(id, ctx);
    await this.prisma.visit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log(ctx, { action: 'visit.delete', entity: 'Visit', entityId: id, before });
  }
}

type CalendarQuerySubset = Partial<Pick<CalendarQuery, 'from' | 'to'>>;
