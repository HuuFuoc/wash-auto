import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AdminInspectionPhotoController } from './admin-inspection-photo.controller';
import { AdminInspectionController } from './admin-inspection.controller';
import { AdminWashSessionController } from './admin-wash-session.controller';
import { CustomerWashSessionController } from './customer-wash-session.controller';
import {
  InspectionPhoto,
  InspectionPhotoSchema,
} from './entities/inspection-photo.entity';
import { Inspection, InspectionSchema } from './entities/inspection.entity';
import { WashSession, WashSessionSchema } from './entities/wash-session.entity';
import { InspectionPhotoService } from './inspection-photo.service';
import { InspectionService } from './inspection.service';
import { InspectionPhotoRepository } from './repositories/inspection-photo.repository';
import { InspectionRepository } from './repositories/inspection.repository';
import { WashSessionRepository } from './repositories/wash-session.repository';
import { WasherWashSessionController } from './washer-wash-session.controller';
import { WashSessionService } from './wash-session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WashSession.name, schema: WashSessionSchema },
      { name: Inspection.name, schema: InspectionSchema },
      { name: InspectionPhoto.name, schema: InspectionPhotoSchema },
    ]),
    AuthModule,
    BookingModule,
    ServiceTypeModule,
    VehicleModule,
  ],
  controllers: [
    AdminWashSessionController,
    WasherWashSessionController,
    CustomerWashSessionController,
    AdminInspectionController,
    AdminInspectionPhotoController,
  ],
  providers: [
    WashSessionService,
    WashSessionRepository,
    InspectionService,
    InspectionRepository,
    InspectionPhotoService,
    InspectionPhotoRepository,
  ],
  exports: [
    WashSessionService,
    WashSessionRepository,
    InspectionService,
    InspectionRepository,
  ],
})
export class WashSessionModule {}
