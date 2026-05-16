import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AdminPaymentController } from './admin-payment.controller';
import { Order, OrderSchema } from './entities/order.entity';
import {
  PaymentTransaction,
  PaymentTransactionSchema,
} from './entities/payment-transaction.entity';
import {
  PaymentController,
  PaymentWebhookController,
} from './payment.controller';
import { PaymentService } from './payment.service';
import { PayosService } from './payos.service';
import { OrderRepository } from './repositories/order.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
    ]),
    VehicleModule,
    ServiceTypeModule,
  ],
  controllers: [
    PaymentController,
    PaymentWebhookController,
    AdminPaymentController,
  ],
  providers: [
    PaymentService,
    PayosService,
    OrderRepository,
    PaymentTransactionRepository,
  ],
  exports: [PaymentService, OrderRepository],
})
export class PaymentModule {}
