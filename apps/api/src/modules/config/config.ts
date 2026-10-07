import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../audit/audit.service';
import { RequestContext } from '../../auth/auth.types';
import { Ctx, RequirePermissions } from '../../auth/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const keySchema = z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/);
const configBody = z.object({ value: z.unknown(), category: z.string().trim().max(40).default('general') });
type ConfigBody = z.infer<typeof configBody>;

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  list() { return this.prisma.configuration.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }); }

  async set(key: string, b: ConfigBody, ctx: RequestContext) {
    if (!keySchema.safeParse(key).success) throw new BadRequestException('Clave de configuración inválida');
    const before = await this.prisma.configuration.findUnique({ where: { key } });
    const value = (b.value ?? null) as Prisma.InputJsonValue;
    const after = await this.prisma.configuration.upsert({
      where: { key }, create: { key, value, category: b.category }, update: { value, category: b.category },
    });
    await this.audit.log(ctx, { action: 'config.update', entity: 'Configuration', entityId: key, before, after });
    return after;
  }
}

@Controller('config')
export class ConfigController {
  constructor(private readonly service: ConfigService) {}
  @Get() @RequirePermissions('config.read')
  list() { return this.service.list(); }
  @Put(':key') @RequirePermissions('config.update')
  set(@Param('key') key: string, @Body(new ZodPipe(configBody)) b: ConfigBody, @Ctx() ctx: RequestContext) { return this.service.set(key, b, ctx); }
}

@Module({ controllers: [ConfigController], providers: [ConfigService] })
export class ConfigModule {}
