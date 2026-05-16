import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetTierConfigStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
