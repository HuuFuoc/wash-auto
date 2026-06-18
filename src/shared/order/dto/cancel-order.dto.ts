import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({ example: 'Khach ban dot xuat' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
