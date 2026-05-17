import { ApiProperty } from '@nestjs/swagger';
import { BookingResponseDto } from './booking-response.dto';

export class BookingPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class BookingListResponseDto {
  @ApiProperty({ type: BookingResponseDto, isArray: true })
  data: BookingResponseDto[];

  @ApiProperty({ type: BookingPaginationMetaDto })
  meta: BookingPaginationMetaDto;
}
