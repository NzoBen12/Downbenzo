import { Controller, Get, Global, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';
import { CurrentUser, RequirePermissions } from '../../auth/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_SERVICE, NotificationPayload, NotificationService } from './notification.tokens';
import { RemindersService } from './reminders.service';

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
  providers: [{ provide: NOTIFICATION_SERVICE, useClass: InternalNotificationService }, RemindersService],
  exports: [NOTIFICATION_SERVICE, RemindersService],
})
export class NotificationsModule {}

