import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateChatKnowledgeDto {
  @ApiProperty({
    example: 'Cửa hàng mở cửa lúc mấy giờ?',
    maxLength: 300,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  question: string;

  @ApiProperty({
    example: 'Wash-Auto mở cửa 07:00 - 21:00 mỗi ngày, kể cả cuối tuần.',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  answer: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['giờ mở cửa', 'opening hours', 'mấy giờ'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  keywords?: string[];

  @ApiPropertyOptional({ example: 'policy', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
