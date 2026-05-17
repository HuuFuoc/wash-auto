import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OtpModule } from '../otp/otp.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role, RoleSchema } from './entities/role.entity';
import { User, UserSchema } from './entities/user.entity';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';
import { RefreshTokenService } from './services/refresh-token.service';
import { VerifiedEmailTokenService } from './services/verified-email-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RoleEnum } from './types/role.enum';

interface IDefaultRole {
  code: RoleEnum;
  name: string;
  description: string;
}

const DEFAULT_ROLES: IDefaultRole[] = [
  {
    code: RoleEnum.CUSTOMER,
    name: 'Customer',
    description: 'End user who books and pays for washes',
  },
  {
    code: RoleEnum.CASHIER,
    name: 'Cashier',
    description: 'Front-desk staff handling payments and check-in',
  },
  {
    code: RoleEnum.WASHER,
    name: 'Washer',
    description: 'Staff who performs the actual wash',
  },
  {
    code: RoleEnum.MANAGER,
    name: 'Manager',
    description: 'Branch / operations manager',
  },
  {
    code: RoleEnum.ADMIN,
    name: 'Admin',
    description: 'System administrator',
  },
];

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    PassportModule,
    JwtModule.register({}),
    LoyaltyModule,
    OtpModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    RoleRepository,
    RefreshTokenService,
    VerifiedEmailTokenService,
    JwtStrategy,
  ],
  exports: [
    AuthService,
    UserRepository,
    RoleRepository,
    VerifiedEmailTokenService,
  ],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(private readonly roleRepository: RoleRepository) {}

  async onModuleInit(): Promise<void> {
    for (const role of DEFAULT_ROLES) {
      await this.roleRepository.upsertByCode(role);
    }
    this.logger.log(`Seeded ${DEFAULT_ROLES.length} roles`);
  }
}
