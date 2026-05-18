import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AssignWasherDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'User _id whose role must be `washer` and is_active=true.',
  })
  @IsMongoId()
  washerId: string;
}
