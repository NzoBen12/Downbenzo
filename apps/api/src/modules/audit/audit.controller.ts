import { Controller, Get, Module, Query } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../auth/decorators';
import { dateFilter, dateRangeSchema, paginated, paginationSchema } from '../../common/pagination';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const auditQuery = paginationSchema.merge(dateRangeSchema).extend({
  userId: z.string().optional(), entity: z.string().max(50).optional(), action: z.string().max(60).optional(),
  result: z.nativeEnum(AuditResult).optional(),
});
type AuditQuery = z.infer<typeof auditQuery>;

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermissions('audit.read')
  async list(@Query(new ZodPipe(auditQuery)) q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      createdAt: dateFilter(q.from, q.to), userId: q.userId, entity: q.entity, result: q.result,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.search ? { OR: [{ action: { contains: q.search, mode: 'insensitive' } }, { entityId: q.search }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize,
        include: { user: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(data, total, q.page, q.pageSize);
  }
}

@Module({ controllers: [AuditController] })
export class AuditViewModule {}
