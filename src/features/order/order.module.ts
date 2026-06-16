import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { VerifiedEmailGuard } from '../../shared/guards/verified-email.guard';
import { IdempotencyInterceptor } from '../../shared/interceptors/idempotency.interceptor';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { GoldenHourModule } from '../golden-hour/golden-hour.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PricingPolicyModule } from '../pricing-policy/pricing-policy.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { StaffShiftModule } from '../staff-shift/staff-shift.module';
import { TierConfigModule } from '../tier-config/tier-config.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { VoucherModule } from '../voucher/voucher.module';
import { AdminOrderController } from './admin-order.controller';
import { Order, OrderSchema } from './entities/order.entity';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from './entities/payment-transaction.entity';
import { CashNoShowCron } from './jobs/cash-no-show.cron';
import { OrderExpiryCron } from './jobs/order-expiry.cron';
import { OrderController, PaymentWebhookController } from './order.controller';
import { OrderRepository } from './repositories/order.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { OrderService } from './services/order.service';
import { PayosService } from './services/payos.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
    ]),
    JwtModule.register({}),
    AuthModule,
    EmailModule,
    VehicleModule,
    ServiceTypeModule,
    StaffShiftModule,
    TierConfigModule,
    LoyaltyModule,
    VoucherModule,
    GoldenHourModule,
    PricingPolicyModule,
  ],
  controllers: [
    OrderController,
    PaymentWebhookController,
    AdminOrderController,
  ],
  providers: [
    OrderService,
    PayosService,
    OrderRepository,
    PaymentTransactionRepository,
    OrderExpiryCron,
    CashNoShowCron,
    VerifiedEmailGuard,
    IdempotencyInterceptor,
  ],
  exports: [OrderService, OrderRepository],
})
export class OrderModule {}
