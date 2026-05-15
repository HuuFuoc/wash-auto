import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetServiceTypeStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
