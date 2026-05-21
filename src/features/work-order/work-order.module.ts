import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { StaffShiftModule } from '../staff-shift/staff-shift.module';
import { VehicleTypeModule } from '../vehicle-type/vehicle-type.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AdminWorkOrderController } from './admin-work-order.controller';
import { WorkOrder, WorkOrderSchema } from './entities/work-order.entity';
import { WorkOrderRepository } from './repositories/work-order.repository';
import { WasherWorkOrderController } from './washer-work-order.controller';
import { WorkOrderService } from './work-order.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkOrder.name, schema: WorkOrderSchema },
    ]),
    AuthModule,
    OrderModule,
    ServiceTypeModule,
    StaffShiftModule,
    VehicleModule,
    VehicleTypeModule,
  ],
  controllers: [AdminWorkOrderController, WasherWorkOrderController],
  providers: [WorkOrderService, WorkOrderRepository],
})
export class WorkOrderModule {}
