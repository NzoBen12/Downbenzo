import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_SERVICE, NotificationService } from './notification.tokens';

const DEFAULT_HOURS = 24;
const INTERVAL_MS = 15 * 60_000;

/** Avisa a cada gestor de sus visitas planificadas en las próximas N horas (config `visits.reminder_hours`). */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reminders');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE) private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REMINDERS_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.run().catch((e) => this.logger.error(e.message)), INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<number> {
    const cfg = await this.prisma.configuration.findUnique({ where: { key: 'visits.reminder_hours' } });
    const hours = typeof cfg?.value === 'number' && cfg.value > 0 ? cfg.value : DEFAULT_HOURS;
    const visits = await this.prisma.visit.findMany({
      where: { deletedAt: null, status: 'PLANNED', scheduledAt: { gt: now, lte: new Date(now.getTime() + hours * 3_600_000) }, manager: { userId: { not: null } } },
      select: { id: true, scheduledAt: true, manager: { select: { userId: true } } },
      take: 1000,
    });
    if (visits.length === 0) return 0;
    const already = await this.prisma.notification.findMany({
      where: { type: 'visit.reminder', link: { in: visits.map((v) => `/visits/${v.id}`) } },
      select: { link: true, userId: true },
    });
    const seen = new Set(already.map((n) => `${n.userId}|${n.link}`));
    let sent = 0;
    for (const v of visits) {
      const userId = v.manager.userId!;
      const link = `/visits/${v.id}`;
      if (seen.has(`${userId}|${link}`)) continue;
      await this.notifications.notify({
        userId, type: 'visit.reminder', link,
        title: `Visita próxima: ${v.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      });
      sent++;
    }
    return sent;
  }
}
