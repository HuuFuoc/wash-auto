import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

/**
 * Body for `POST /admin/work-orders` — the cashier check-in action.
 * Creates the job ticket and moves the order from `confirmed` to `checked_in`.
 */
export class CreateWorkOrderDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Id of a confirmed order the customer has just arrived for.',
  })
  @IsMongoId()
  orderId: string;
}
