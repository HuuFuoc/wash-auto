import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminVoucherController } from './admin-voucher.controller';
import { Voucher, VoucherSchema } from './entities/voucher.entity';
import { VoucherExpiryCron } from './jobs/voucher-expiry.cron';
import { VoucherRepository } from './repositories/voucher.repository';
import { VoucherController } from './voucher.controller';
import { VoucherService } from './voucher.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Voucher.name, schema: VoucherSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [VoucherController, AdminVoucherController],
  providers: [VoucherService, VoucherRepository, VoucherExpiryCron],
  exports: [VoucherService, VoucherRepository],
})
export class VoucherModule {}
