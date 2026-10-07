import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ExportFormat, ExportService } from '../../export/export.service';
import {
  CalendarQuery, VisitBody, VisitQuery, VisitStatusBody, VisitUpdate,
  calendarQuery, visitBody, visitExportQuery, visitQuery, visitStatusBody, visitUpdate,
} from './visits.schemas';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(
    private readonly service: VisitsService,
    private readonly exporter: ExportService,
  ) {}

  @Get() @RequirePermissions('visits.read')
  list(@Query(new ZodPipe(visitQuery)) q: VisitQuery, @Ctx() ctx: RequestContext) {
    return this.service.list(q, ctx);
  }

  @Get('calendar') @RequirePermissions('visits.read')
  calendar(@Query(new ZodPipe(calendarQuery)) q: CalendarQuery, @Ctx() ctx: RequestContext) {
    return this.service.calendar(q, ctx);
  }

  @Get('export') @RequirePermissions('visits.read', 'reports.export')
  async export(
    @Query(new ZodPipe(visitExportQuery)) q: VisitQuery & { format: ExportFormat },
    @Ctx() ctx: RequestContext,
    @Res() res: Response,
  ) {
    const visits = await this.service.listAll(q, ctx);
    await this.exporter.send(res, q.format, 'visitas', [
      { header: 'Fecha', key: 'scheduledAt' },
      { header: 'Estado', key: 'status' },
      { header: 'Agencia', key: 'agency' },
      { header: 'Gestor', key: 'manager' },
      { header: 'Cliente/Prospecto', key: 'party' },
      { header: 'Resultado', key: 'result' },
      { header: 'Observaciones', key: 'notes' },
    ], visits.map((v) => ({
      scheduledAt: v.scheduledAt,
      status: v.status,
      agency: v.agency.name,
      manager: v.manager.fullName,
      party: v.prospect?.fullName ?? v.customer?.fullName,
      result: v.result,
      notes: v.notes,
    })));
  }

  @Get(':id') @RequirePermissions('visits.read')
  get(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.get(id, ctx); }

  @Post() @RequirePermissions('visits.create')
  create(@Body(new ZodPipe(visitBody)) b: VisitBody, @Ctx() ctx: RequestContext) { return this.service.create(b, ctx); }

  @Patch(':id') @RequirePermissions('visits.update')
  update(@Param('id') id: string, @Body(new ZodPipe(visitUpdate)) b: VisitUpdate, @Ctx() ctx: RequestContext) {
    return this.service.update(id, b, ctx);
  }

  @Post(':id/status') @HttpCode(200) @RequirePermissions('visits.update')
  status(@Param('id') id: string, @Body(new ZodPipe(visitStatusBody)) b: VisitStatusBody, @Ctx() ctx: RequestContext) {
    return this.service.changeStatus(id, b, ctx);
  }

  @Delete(':id') @HttpCode(204) @RequirePermissions('visits.delete')
  remove(@Param('id') id: string, @Ctx() ctx: RequestContext) { return this.service.remove(id, ctx); }
}
