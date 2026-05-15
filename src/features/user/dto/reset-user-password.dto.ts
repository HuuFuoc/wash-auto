import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'NewStrongP@ss123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
