import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminServiceTypeController } from './admin-service-type.controller';
import { ServiceType, ServiceTypeSchema } from './entities/service-type.entity';
import { ServiceTypeRepository } from './repositories/service-type.repository';
import { ServiceTypeController } from './service-type.controller';
import { ServiceTypeService } from './service-type.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceType.name, schema: ServiceTypeSchema },
    ]),
  ],
  controllers: [ServiceTypeController, AdminServiceTypeController],
  providers: [ServiceTypeService, ServiceTypeRepository],
  exports: [ServiceTypeService, ServiceTypeRepository],
})
export class ServiceTypeModule {}
