import { ApiProperty } from '../../../common/swagger-shim';
import { IsMongoId } from 'class-validator';

export class AssignWasherDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Id of a user whose role is `washer`.',
  })
  @IsMongoId()
  washerId: string;
}
