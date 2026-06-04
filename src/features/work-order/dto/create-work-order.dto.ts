import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsUrl,
} from 'class-validator';

/**
 * Body for `POST /admin/work-orders` - the cashier check-in action.
 * Creates the job ticket and moves the order from `confirmed` to `checked_in`.
 */
export class CreateWorkOrderDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Id of a confirmed order the customer has just arrived for.',
  })
  @IsMongoId()
  orderId: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/checkin/abc-front.jpg'],
    description:
      'URLs of the vehicle photos the cashier captured at check-in. The FE ' +
      'uploads the images and passes the resulting URLs here (max 10).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  checkinPhotos?: string[];
}
