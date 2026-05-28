import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { Voucher, VoucherSchema } from './entities/voucher.entity';
import { VoucherExpiryCron } from './jobs/voucher-expiry.cron';
import { VoucherRepository } from './repositories/voucher.repository';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Voucher.name, schema: VoucherSchema }]),
    ServiceTypeModule,
  ],
  controllers: [VoucherController],
  providers: [VoucherService, VoucherRepository, VoucherExpiryCron],
  exports: [VoucherService, VoucherRepository],
})
export class VoucherModule {}
