import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'secret'];

export function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (SENSITIVE_KEYS.includes(k) ? '[REDACTED]' : v)),
  ) as Prisma.InputJsonValue;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  result?: AuditResult;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async log(ctx: RequestContext, e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: ctx.user?.id ?? null,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId ?? null,
          before: redact(e.before),
          after: redact(e.after),
          ip: ctx.ip ?? null,
          requestId: ctx.requestId ?? null,
          result: e.result ?? AuditResult.SUCCESS,
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar auditoría: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
