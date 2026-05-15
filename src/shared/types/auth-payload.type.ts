import { RoleEnum } from '../../features/auth/types/role.enum';

export interface IAuthPayload {
  sub: string;
  email: string;
  role: RoleEnum;
}
