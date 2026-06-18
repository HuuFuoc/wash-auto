import { ApiProperty } from '../../../common/swagger-shim';
import { IsBoolean } from 'class-validator';

export class SetUserStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
