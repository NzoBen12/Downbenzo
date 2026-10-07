import { Controller, Get, Global, Inject, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Contrato desacoplado: la implementación interna guarda en BD; correo/push se conectan aquí. */
export interface NotificationService {
  notify(payload: NotificationPayload): Promise<void>;
}
export const NOTIFICATION_SERVICE = Symbol('NOTIFICATION_SERVICE');

@Injectable()
export class InternalNotificationService implements NotificationService {
  constructor(private readonly prisma: PrismaService) {}
  async notify(p: NotificationPayload): Promise<void> {
    await this.prisma.notification.create({ data: p });
  }
}

@Controller('notifications')
@RequirePermissions('notifications.read')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    const where = { userId: user.id, ...(unread === 'true' ? { readAt: null } : {}) };
    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { data, unreadCount };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [{ provide: NOTIFICATION_SERVICE, useClass: InternalNotificationService }],
  exports: [NOTIFICATION_SERVICE],
})
export class NotificationsModule {}

export const InjectNotifications = () => Inject(NOTIFICATION_SERVICE);
