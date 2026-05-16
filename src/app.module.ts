import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import cacheConfig from './config/cache.config';
import databaseConfig from './config/database.config';
import payosConfig from './config/payos.config';
import { CacheModule } from './core/cache/cache.module';
import { DatabaseModule } from './core/database/database.module';
import { AuthModule } from './features/auth/auth.module';
import { ServiceTypeModule } from './features/service-type/service-type.module';
import { PaymentModule } from './features/payment/payment.module';
import { TierConfigModule } from './features/tier-config/tier-config.module';
import { UserModule } from './features/user/user.module';
import { VehicleModule } from './features/vehicle/vehicle.module';
import { VehicleTypeModule } from './features/vehicle-type/vehicle-type.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, cacheConfig, payosConfig],
    }),
    DatabaseModule,
    CacheModule,
    AuthModule,
    ServiceTypeModule,
    UserModule,
    VehicleTypeModule,
    VehicleModule,
    TierConfigModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
