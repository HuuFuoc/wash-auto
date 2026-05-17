import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { StaffShiftModule } from '../staff-shift/staff-shift.module';
import { TierConfigModule } from '../tier-config/tier-config.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AdminBookingController } from './admin-booking.controller';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking, BookingSchema } from './entities/booking.entity';
import { BookingRepository } from './repositories/booking.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    AuthModule,
    VehicleModule,
    ServiceTypeModule,
    StaffShiftModule,
    TierConfigModule,
    LoyaltyModule,
  ],
  controllers: [BookingController, AdminBookingController],
  providers: [BookingService, BookingRepository],
  exports: [BookingService, BookingRepository],
})
export class BookingModule {}
