import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
import { IAuthPayload } from '../../shared/types/auth-payload.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserDocument } from './entities/user.entity';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';
import {
  IRefreshTokenPayload,
  RefreshTokenService,
} from './services/refresh-token.service';
import { RoleEnum } from './types/role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    this.logger.log('Registering new user', { email: dto.email });

    if (await this.userRepository.existsByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    if (await this.userRepository.existsByPhone(dto.phone)) {
      throw new ConflictException('Phone already registered');
    }

    const customerRole = await this.roleRepository.findByCode(
      RoleEnum.CUSTOMER,
    );
    if (!customerRole) {
      throw new InternalServerErrorException('Customer role not seeded');
    }

    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.userRepository.createUser({
      roleId: customerRole._id,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      passwordHash,
      dateOfBirth: dto.dateOfBirth,
    });

    // Auto-create loyalty account at Member tier. Idempotent —
    // safe if a later read endpoint also lazy-creates.
    try {
      await this.loyaltyService.ensureForCustomer(user._id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'Loyalty auto-create failed during register; will lazy-create on first /me/loyalty read',
        { userId: user._id.toString(), error: message },
      );
    }

    return UserResponseDto.fromDocument(user, RoleEnum.CUSTOMER);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    this.logger.log('Login attempt', { email: dto.email });

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: IRefreshTokenPayload;
    try {
      payload = await this.refreshTokenService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (await this.refreshTokenService.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    await this.refreshTokenService.blacklist(payload.jti, payload.exp);

    return this.issueTokenPair(user);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.refreshTokenService.verify(refreshToken);
      await this.refreshTokenService.blacklist(payload.jti, payload.exp);
    } catch {
      // Token already invalid/expired — nothing to revoke
    }
  }

  private async issueTokenPair(user: UserDocument): Promise<AuthResponseDto> {
    const role = await this.roleRepository.findById(user.role_id);
    if (!role || !role.is_active) {
      throw new UnauthorizedException('Role is inactive');
    }

    const accessPayload: IAuthPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: role.code,
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.getOrThrow<string>('auth.accessSecret'),
      expiresIn: this.configService.getOrThrow<string>(
        'auth.accessTtl',
      ) as SignOptions['expiresIn'],
    });

    const refresh = await this.refreshTokenService.sign(user._id.toString());

    return {
      accessToken,
      refreshToken: refresh.token,
      user: UserResponseDto.fromDocument(user, role.code),
    };
  }
}
