import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminStaffShiftController } from './admin-staff-shift.controller';
import { StaffShift, StaffShiftSchema } from './entities/staff-shift.entity';
import { StaffShiftRepository } from './repositories/staff-shift.repository';
import { StaffShiftController } from './staff-shift.controller';
import { StaffShiftService } from './staff-shift.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StaffShift.name, schema: StaffShiftSchema },
    ]),
    AuthModule,
  ],
  controllers: [StaffShiftController, AdminStaffShiftController],
  providers: [StaffShiftService, StaffShiftRepository],
  exports: [StaffShiftService, StaffShiftRepository],
})
export class StaffShiftModule {}
