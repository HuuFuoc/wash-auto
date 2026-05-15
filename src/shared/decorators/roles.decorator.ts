import { SetMetadata } from '@nestjs/common';
import { RoleEnum } from '../../features/auth/types/role.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RoleEnum[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
