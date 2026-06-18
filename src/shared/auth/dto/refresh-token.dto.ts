import { ApiProperty } from '../../../common/swagger-shim';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...' })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken: string;
}
