import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminVehicleTypeController } from './admin-vehicle-type.controller';
import { VehicleType, VehicleTypeSchema } from './entities/vehicle-type.entity';
import { VehicleTypeRepository } from './repositories/vehicle-type.repository';
import { VehicleTypeController } from './vehicle-type.controller';
import { VehicleTypeService } from './vehicle-type.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VehicleType.name, schema: VehicleTypeSchema },
    ]),
  ],
  controllers: [VehicleTypeController, AdminVehicleTypeController],
  providers: [VehicleTypeService, VehicleTypeRepository],
  exports: [VehicleTypeService, VehicleTypeRepository],
})
export class VehicleTypeModule {}
