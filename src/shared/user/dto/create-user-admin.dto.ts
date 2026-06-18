import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RoleEnum } from '../../auth/types/role.enum';

export class CreateUserAdminDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be 8-20 chars (digits, +, -, spaces)',
  })
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: 'cashier1@washauto.local' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ enum: RoleEnum, example: RoleEnum.CASHIER })
  @IsEnum(RoleEnum)
  role: RoleEnum;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '1995-01-15' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;
}
