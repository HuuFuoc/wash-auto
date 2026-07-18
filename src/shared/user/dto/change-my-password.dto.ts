import { ApiProperty } from '../../../common/swagger-shim';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'OldP@ss123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  oldPassword: string;

  @ApiProperty({ example: 'NewStrongP@ss123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
