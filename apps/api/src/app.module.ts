import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, CsrfGuard, PermissionsGuard } from './auth/guards';
import { AllExceptionsFilter, RequestIdMiddleware } from './common/http';
import { loadEnv } from './config/env';
import { ExportModule } from './export/export.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.service';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { AuditViewModule } from './modules/audit/audit.controller';
import { CardsModule } from './modules/cards/cards';
import { ConfigModule } from './modules/config/config';
import { CurrencyModule } from './modules/currency/currency';
import { CustomersModule } from './modules/customers/customers';
import { DashboardModule } from './modules/dashboard/dashboard.controller';
import { GoalsModule } from './modules/goals/goals';
import { LotsModule } from './modules/lots/lots';
import { ManagersModule } from './modules/managers/managers';
import { NotificationsModule } from './modules/notifications/notifications';
import { ProductsModule } from './modules/products/products';
import { ProspectsModule } from './modules/prospects/prospects';
import { ReportsModule } from './modules/reports/reports';
import { RolesModule } from './modules/roles/roles';
import { SearchModule } from './modules/search/search';
import { UsersModule } from './modules/users/users';
import { VisitsModule } from './modules/visits/visits.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: loadEnv().RATE_LIMIT_PER_MINUTE }]),
    PrismaModule, AuditModule, ExportModule, AuthModule, NotificationsModule,
    AgenciesModule, ManagersModule, ProspectsModule, CustomersModule, VisitsModule,
    ProductsModule, CurrencyModule, LotsModule, CardsModule, GoalsModule,
    UsersModule, RolesModule, ConfigModule, AuditViewModule,
    DashboardModule, ReportsModule, SearchModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
