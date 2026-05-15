import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUserController } from './admin-user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
