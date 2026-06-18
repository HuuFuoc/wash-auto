import { ApiProperty } from '../../../common/swagger-shim';
import { UserResponseDto } from '../../auth/dto/user-response.dto';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 95 })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class UserListResponseDto {
  @ApiProperty({ type: UserResponseDto, isArray: true })
  data: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
