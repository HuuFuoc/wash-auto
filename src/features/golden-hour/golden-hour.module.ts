import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GoldenHourConfig,
  GoldenHourConfigSchema,
} from './entities/golden-hour-config.entity';
import { GoldenHourService } from './golden-hour.service';
import { GoldenHourConfigRepository } from './repositories/golden-hour-config.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoldenHourConfig.name, schema: GoldenHourConfigSchema },
    ]),
  ],
  providers: [GoldenHourService, GoldenHourConfigRepository],
  exports: [GoldenHourService, GoldenHourConfigRepository],
})
export class GoldenHourModule implements OnModuleInit {
  private readonly logger = new Logger(GoldenHourModule.name);

  constructor(private readonly service: GoldenHourService) {}

  async onModuleInit(): Promise<void> {
    await this.service.seedDefaults();
    this.logger.log('Golden hour configs ready');
  }
}
