import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Role, RoleSchema } from '../auth/entities/role.entity';
import { User, UserSchema } from '../auth/entities/user.entity';
import {
  LoyaltyAccount,
  LoyaltyAccountSchema,
} from '../loyalty/entities/loyalty-account.entity';
import { Order, OrderSchema } from '../order/entities/order.entity';
import {
  StaffShift,
  StaffShiftSchema,
} from '../staff-shift/entities/staff-shift.entity';
import { Vehicle, VehicleSchema } from '../vehicle/entities/vehicle.entity';
import { Voucher, VoucherSchema } from '../voucher/entities/voucher.entity';
import {
  WorkOrder,
  WorkOrderSchema,
} from '../work-order/entities/work-order.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Vehicle.name, schema: VehicleSchema },
      { name: Voucher.name, schema: VoucherSchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
      { name: StaffShift.name, schema: StaffShiftSchema },
    ]),
    AuthModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
