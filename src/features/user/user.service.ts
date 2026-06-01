import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { UserDocument } from '../auth/entities/user.entity';
import { RoleRepository } from '../auth/repositories/role.repository';
import {
  IUserListFilter,
  UserRepository,
} from '../auth/repositories/user.repository';
import { RoleEnum } from '../auth/types/role.enum';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly configService: ConfigService,
  ) {}

  async list(query: QueryUserDto): Promise<UserListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: IUserListFilter = {
      isActive: query.isActive,
      search: query.search,
    };

    if (query.role) {
      const roleDoc = await this.roleRepository.findByCode(query.role);
      if (!roleDoc) {
        // Role enum exists but document not seeded - return empty result
        return {
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
      filter.roleId = roleDoc._id;
    }

    const [users, total] = await Promise.all([
      this.userRepository.findPaginated(filter, page, limit),
      this.userRepository.countMatching(filter),
    ]);

    const roleMap = await this.buildRoleCodeMap(users);
    const data = users.map((u) =>
      UserResponseDto.fromDocument(
        u,
        roleMap.get(u.role_id.toString()) ?? RoleEnum.CUSTOMER,
      ),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getOne(id: string): Promise<UserResponseDto> {
    const user = await this.requireUser(id);
    const role = await this.roleRepository.findById(user.role_id);
    return UserResponseDto.fromDocument(user, role?.code ?? RoleEnum.CUSTOMER);
  }

  async create(dto: CreateUserAdminDto): Promise<UserResponseDto> {
    if (await this.userRepository.existsByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    if (await this.userRepository.existsByPhone(dto.phone)) {
      throw new ConflictException('Phone already registered');
    }

    const role = await this.roleRepository.findByCode(dto.role);
    if (!role) {
      throw new InternalServerErrorException(
        `Role ${dto.role} not seeded - restart app or seed roles`,
      );
    }

    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.userRepository.createUser({
      roleId: role._id,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      passwordHash,
      avatarUrl: dto.avatarUrl,
      dateOfBirth: dto.dateOfBirth,
    });

    this.logger.log('Admin created user', {
      userId: user._id.toString(),
      role: dto.role,
    });
    return UserResponseDto.fromDocument(user, role.code);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.requireUser(id);

    if (dto.phone && dto.phone !== user.phone) {
      if (await this.userRepository.existsByPhoneExcept(dto.phone, user._id)) {
        throw new ConflictException('Phone already registered');
      }
    }

    const updated = await this.userRepository.updateById(id, {
      name: dto.name,
      phone: dto.phone,
      avatarUrl: dto.avatarUrl,
      dateOfBirth: dto.dateOfBirth,
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    const role = await this.roleRepository.findById(updated.role_id);
    return UserResponseDto.fromDocument(
      updated,
      role?.code ?? RoleEnum.CUSTOMER,
    );
  }

  async changeRole(
    id: string,
    dto: ChangeUserRoleDto,
  ): Promise<UserResponseDto> {
    await this.requireUser(id);
    const role = await this.roleRepository.findByCode(dto.role);
    if (!role) {
      throw new InternalServerErrorException(`Role ${dto.role} not seeded`);
    }
    const updated = await this.userRepository.updateById(id, {
      roleId: role._id,
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.log('Admin changed user role', {
      userId: id,
      newRole: dto.role,
    });
    return UserResponseDto.fromDocument(updated, role.code);
  }

  async setStatus(
    actorId: string,
    id: string,
    dto: SetUserStatusDto,
  ): Promise<UserResponseDto> {
    if (id === actorId && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.requireUser(id);
    const updated = await this.userRepository.updateById(id, {
      isActive: dto.isActive,
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.log('Admin toggled user status', {
      userId: id,
      isActive: dto.isActive,
    });
    const role = await this.roleRepository.findById(user.role_id);
    return UserResponseDto.fromDocument(
      updated,
      role?.code ?? RoleEnum.CUSTOMER,
    );
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<{ message: string }> {
    await this.requireUser(id);
    const saltRounds = this.configService.getOrThrow<number>(
      'auth.bcryptSaltRounds',
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);
    const updated = await this.userRepository.updateById(id, { passwordHash });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.warn('Admin reset user password', { userId: id });
    return { message: 'Password reset successfully' };
  }

  async softDelete(actorId: string, id: string): Promise<void> {
    if (id === actorId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    await this.requireUser(id);
    const updated = await this.userRepository.updateById(id, {
      isActive: false,
      deleteRequestedAt: new Date(),
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    this.logger.warn('Admin soft-deleted user', { userId: id });
  }

  private async requireUser(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async buildRoleCodeMap(
    users: UserDocument[],
  ): Promise<Map<string, RoleEnum>> {
    const uniqueRoleIds = [...new Set(users.map((u) => u.role_id.toString()))];
    const roleDocs = await Promise.all(
      uniqueRoleIds.map((rid) => this.roleRepository.findById(rid)),
    );
    const map = new Map<string, RoleEnum>();
    for (const role of roleDocs) {
      if (role) {
        map.set(role._id.toString(), role.code);
      }
    }
    return map;
  }
}
