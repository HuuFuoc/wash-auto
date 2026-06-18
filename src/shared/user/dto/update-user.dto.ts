import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be 8-20 chars (digits, +, -, spaces)',
  })
  @MaxLength(20)
  phone?: string;

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
