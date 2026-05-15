import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetVehicleTypeStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
