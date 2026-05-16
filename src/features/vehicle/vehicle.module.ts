import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VehicleTypeModule } from '../vehicle-type/vehicle-type.module';
import { AdminVehicleController } from './admin-vehicle.controller';
import { Vehicle, VehicleSchema } from './entities/vehicle.entity';
import { VehicleRepository } from './repositories/vehicle.repository';
import { VehicleController } from './vehicle.controller';
import { VehicleService } from './vehicle.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Vehicle.name, schema: VehicleSchema }]),
    VehicleTypeModule,
  ],
  controllers: [VehicleController, AdminVehicleController],
  providers: [VehicleService, VehicleRepository],
  exports: [VehicleService, VehicleRepository],
})
export class VehicleModule {}
