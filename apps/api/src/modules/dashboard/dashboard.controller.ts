import { Controller, Get, Module, Query } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';
import { z } from 'zod';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { dateRangeSchema } from '../../common/pagination';
import { ZodPipe } from '../../common/zod.pipe';
import { DashboardService } from './dashboard.service';

export const dashboardQuery = dateRangeSchema.extend({
  agencyId: z.string().optional(),
  managerId: z.string().optional(),
  status: z.nativeEnum(VisitStatus).optional(),
});

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get() @RequirePermissions('dashboard.read')
  overview(@Query(new ZodPipe(dashboardQuery)) q: z.infer<typeof dashboardQuery>, @Ctx() ctx: RequestContext) {
    return this.service.overview(q, ctx);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService], exports: [DashboardService] })
export class DashboardModule {}
