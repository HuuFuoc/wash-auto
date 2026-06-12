import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { VehicleTypeModule } from '../vehicle-type/vehicle-type.module';
import { AdminUserController } from './admin-user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule, ServiceTypeModule, VehicleTypeModule],
  controllers: [AdminUserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
