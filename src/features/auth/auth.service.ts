import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    this.logger.log('Registering new user', { email: dto.email });

    const exists = await this.userRepository.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.userRepository.createUser({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });

    return UserResponseDto.fromDocument(user);
  }
}
