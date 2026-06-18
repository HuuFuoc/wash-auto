import { RoleEnum } from '../auth/types/role.enum';

export interface IAuthPayload {
  sub: string;
  email: string;
  role: RoleEnum;
}
