import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '../../common/exceptions';
import { config } from '../../config';
import { UserResponseDto } from '../../shared/auth/dto/user-response.dto';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { ChangeMyPasswordDto } from '../../shared/user/dto/change-my-password.dto';
import { ChangeUserRoleDto } from '../../shared/user/dto/change-user-role.dto';
import { CreateUserAdminDto } from '../../shared/user/dto/create-user-admin.dto';
import { QueryUserDto } from '../../shared/user/dto/query-user.dto';
import { ResetUserPasswordDto } from '../../shared/user/dto/reset-user-password.dto';
import { SetUserStatusDto } from '../../shared/user/dto/set-user-status.dto';
import { UpdateUserDto } from '../../shared/user/dto/update-user.dto';
import { UserListResponseDto } from '../../shared/user/dto/user-list-response.dto';
import { RoleRepository } from '../auth/role.repository';
import { UserDocument } from '../auth/user.model';
import { IUserListFilter, UserRepository } from '../auth/user.repository';

// Business logic copied verbatim from features/user/user.service.ts; only DI +
// ConfigService + Nest exceptions + Logger were swapped out. Reuses auth's
// User model + repositories (no own entity).
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
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

    const saltRounds = config.auth.bcryptSaltRounds;
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

    console.log('Admin created user', {
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
    console.log('Admin changed user role', {
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
    console.log('Admin toggled user status', {
      userId: id,
      isActive: dto.isActive,
    });
    const role = await this.roleRepository.findById(user.role_id);
    return UserResponseDto.fromDocument(
      updated,
      role?.code ?? RoleEnum.CUSTOMER,
    );
  }

  /** Self-service password change — requires proving the current password. */
  async changePassword(
    userId: string,
    dto: ChangeMyPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.requireUser(userId);
    const matches = await bcrypt.compare(dto.oldPassword, user.password_hash);
    if (!matches) {
      throw new BadRequestException('Old password is incorrect');
    }
    const saltRounds = config.auth.bcryptSaltRounds;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);
    const updated = await this.userRepository.updateById(userId, {
      passwordHash,
    });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    console.log('User changed own password', { userId });
    return { message: 'Password changed successfully' };
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<{ message: string }> {
    await this.requireUser(id);
    const saltRounds = config.auth.bcryptSaltRounds;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);
    const updated = await this.userRepository.updateById(id, { passwordHash });
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    console.warn('Admin reset user password', { userId: id });
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
    console.warn('Admin soft-deleted user', { userId: id });
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
