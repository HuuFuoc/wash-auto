import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelWashSessionDto {
  @ApiPropertyOptional({ example: 'Khách đổi ý không rửa nữa' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
