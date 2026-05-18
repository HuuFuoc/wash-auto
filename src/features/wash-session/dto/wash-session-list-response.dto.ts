import { ApiProperty } from '@nestjs/swagger';
import { WashSessionResponseDto } from './wash-session-response.dto';

export class WashSessionPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class WashSessionListResponseDto {
  @ApiProperty({ type: WashSessionResponseDto, isArray: true })
  data: WashSessionResponseDto[];

  @ApiProperty({ type: WashSessionPaginationMetaDto })
  meta: WashSessionPaginationMetaDto;
}
