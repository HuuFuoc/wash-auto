import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { OtpService } from './otp.service';

@Module({
  imports: [EmailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
