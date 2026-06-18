import { ApiProperty } from '../../../common/swagger-shim';
import { IsEnum } from 'class-validator';
import { RoleEnum } from '../../auth/types/role.enum';

export class ChangeUserRoleDto {
  @ApiProperty({ enum: RoleEnum, example: RoleEnum.MANAGER })
  @IsEnum(RoleEnum)
  role: RoleEnum;
}
