import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { AssetsModule } from './assets/assets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { PreventivePlansModule } from './preventive-plans/preventive-plans.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    // ConfigModule must be first — all others depend on ConfigService
    ConfigModule,

    LoggerModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => ({
        pinoHttp: {
          level: cfg.get<string>('NODE_ENV') !== 'production' ? 'debug' : 'info',
          transport:
            cfg.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty' }
              : undefined,
        },
      }),
    }),
   
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [
          {
            ttl: cfg.get<number>('THROTTLE_TTL', 60_000),
            limit: cfg.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    ScheduleModule.forRoot(),
    RedisModule,
    PrismaModule,
    SystemConfigModule,
    AuthModule,
    MailModule,
    UsersModule,
    StorageModule,
    NotificationsModule,
    AssetsModule,
    WorkOrdersModule,
    InventoryModule,
    PreventivePlansModule,
    ReportsModule,
    AdminModule,
  ],
  
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
