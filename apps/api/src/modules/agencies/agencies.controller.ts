import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ExportService } from '../../export/export.service';
import {
  AgencyBody, AgencyQuery, AgencyUpdate, agencyBody, agencyExportQuery, agencyQuery, agencyUpdate,
} from './agencies.schemas';
import { AgenciesService } from './agencies.service';

@Controller('agencies')
export class AgenciesController {
  constructor(
    private readonly service: AgenciesService,
    private readonly exporter: ExportService,
  ) {}

  @Get()
  @RequirePermissions('agencies.read')
  list(@Query(new ZodPipe(agencyQuery)) q: AgencyQuery, @Ctx() ctx: RequestContext) {
    return this.service.list(q, ctx);
  }

  @Get('export')
  @RequirePermissions('agencies.read', 'reports.export')
  async export(
    @Query(new ZodPipe(agencyExportQuery)) q: AgencyQuery & { format: 'csv' | 'xlsx' | 'pdf' },
    @Ctx() ctx: RequestContext,
    @Res() res: Response,
  ) {
    const rows = await this.service.listAll(q, ctx);
    await this.exporter.send(res, q.format, 'agencias', [
      { header: 'Código', key: 'code' },
      { header: 'Nombre', key: 'name' },
      { header: 'Localidad', key: 'city' },
      { header: 'Teléfono', key: 'phone' },
      { header: 'Activa', key: 'isActive' },
    ], rows);
  }

  @Get(':id')
  @RequirePermissions('agencies.read')
  get(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.get(id, ctx);
  }

  @Post()
  @RequirePermissions('agencies.create')
  create(@Body(new ZodPipe(agencyBody)) body: AgencyBody, @Ctx() ctx: RequestContext) {
    return this.service.create(body, ctx);
  }

  @Patch(':id')
  @RequirePermissions('agencies.update')
  update(@Param('id') id: string, @Body(new ZodPipe(agencyUpdate)) body: AgencyUpdate, @Ctx() ctx: RequestContext) {
    return this.service.update(id, body, ctx);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('agencies.update')
  activate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.setActive(id, true, ctx);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('agencies.update')
  deactivate(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.setActive(id, false, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('agencies.delete')
  remove(@Param('id') id: string, @Ctx() ctx: RequestContext) {
    return this.service.remove(id, ctx);
  }
}
