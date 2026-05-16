import { ApiProperty } from '@nestjs/swagger';
import { VehicleResponseDto } from './vehicle-response.dto';

export class VehiclePaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class VehicleListResponseDto {
  @ApiProperty({ type: VehicleResponseDto, isArray: true })
  data: VehicleResponseDto[];

  @ApiProperty({ type: VehiclePaginationMetaDto })
  meta: VehiclePaginationMetaDto;
}
