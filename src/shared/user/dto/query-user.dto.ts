import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RoleEnum } from '../../auth/types/role.enum';

export class QueryUserDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: RoleEnum })
  @IsOptional()
  @IsEnum(RoleEnum)
  role?: RoleEnum;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value === 'true' : !!value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'nguyen',
    description: 'Case-insensitive partial match on name/email/phone',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
