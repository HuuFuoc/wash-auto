import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Body for `POST /me/feedback` — a customer rates a completed order. Upsert:
 * submitting again for the same order updates the existing rating/comment.
 */
export class CreateFeedbackDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'The completed order being rated.',
  })
  @IsMongoId()
  orderId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({
    example: 'Thợ rửa sạch, thái độ tốt.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
