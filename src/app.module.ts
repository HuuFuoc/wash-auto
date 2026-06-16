import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import bookingConfig from './config/booking.config';
import cacheConfig from './config/cache.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import geminiConfig from './config/gemini.config';
import otpConfig from './config/otp.config';
import payosConfig from './config/payos.config';
import { configValidationSchema } from './config/validation.schema';
import { CacheModule } from './core/cache/cache.module';
import { DatabaseModule } from './core/database/database.module';
import { AuthModule } from './features/auth/auth.module';
import { ChatModule } from './features/chat/chat.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { GoldenHourModule } from './features/golden-hour/golden-hour.module';
import { LoyaltyModule } from './features/loyalty/loyalty.module';
import { OrderModule } from './features/order/order.module';
import { PricingPolicyModule } from './features/pricing-policy/pricing-policy.module';
import { ServiceTypeModule } from './features/service-type/service-type.module';
import { StaffShiftModule } from './features/staff-shift/staff-shift.module';
import { TierConfigModule } from './features/tier-config/tier-config.module';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './features/user/user.module';
import { VehicleModule } from './features/vehicle/vehicle.module';
import { VehicleTypeModule } from './features/vehicle-type/vehicle-type.module';
import { VoucherModule } from './features/voucher/voucher.module';
import { WorkOrderModule } from './features/work-order/work-order.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: { abortEarly: true },
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        cacheConfig,
        payosConfig,
        bookingConfig,
        otpConfig,
        emailConfig,
        geminiConfig,
      ],
    }),
    // Global rate-limit: 60 requests / 60s / IP. OTP service enforces an
    // additional per-email cap inside the service layer.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CacheModule,
    AuthModule,
    ServiceTypeModule,
    UserModule,
    VehicleTypeModule,
    VehicleModule,
    TierConfigModule,
    VoucherModule,
    GoldenHourModule,
    PricingPolicyModule,
    LoyaltyModule,
    StaffShiftModule,
    OrderModule,
    WorkOrderModule,
    ChatModule,
    DashboardModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
