import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

const startedAt = Date.now();
const counters = { requests: 0 };
export const countRequest = () => counters.requests++;

@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }

  @Get('metrics')
  metrics() {
    return { uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), requests: counters.requests };
  }
}
