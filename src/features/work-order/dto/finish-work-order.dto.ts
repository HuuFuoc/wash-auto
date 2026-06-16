import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUrl } from 'class-validator';

/**
 * Body for `PATCH /me/work-orders/:id/finish` - the washer marks the wash done.
 * At least one post-wash photo is required so the cashier always has something
 * to review at quality check. The FE uploads the images and passes the URLs.
 */
export class FinishWorkOrderDto {
  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/checkout/abc-front.jpg'],
    description:
      'URLs of the post-wash photos the washer captured (at least 1, max 10).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  checkoutPhotos: string[];
}
