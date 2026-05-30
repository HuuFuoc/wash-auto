import { ApiProperty } from '@nestjs/swagger';
import { VoucherResponseDto } from './voucher-response.dto';

export class VoucherListMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 137 })
  total: number;

  @ApiProperty({ example: 7 })
  totalPages: number;
}

export class VoucherListResponseDto {
  @ApiProperty({ type: VoucherResponseDto, isArray: true })
  data: VoucherResponseDto[];

  @ApiProperty({ type: VoucherListMetaDto })
  meta: VoucherListMetaDto;
}
