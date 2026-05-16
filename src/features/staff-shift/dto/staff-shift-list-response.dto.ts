import { ApiProperty } from '@nestjs/swagger';
import { StaffShiftResponseDto } from './staff-shift-response.dto';

export class StaffShiftPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class StaffShiftListResponseDto {
  @ApiProperty({ type: StaffShiftResponseDto, isArray: true })
  data: StaffShiftResponseDto[];

  @ApiProperty({ type: StaffShiftPaginationMetaDto })
  meta: StaffShiftPaginationMetaDto;
}
