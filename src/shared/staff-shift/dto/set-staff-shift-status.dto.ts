import { ApiProperty } from '../../../common/swagger-shim';
import { IsEnum } from 'class-validator';
import { ShiftStatusEnum } from '../types/shift-status.enum';

export class SetStaffShiftStatusDto {
  @ApiProperty({
    enum: ShiftStatusEnum,
    example: ShiftStatusEnum.ACTIVE,
    description:
      'Allowed transitions: scheduled→active, active→completed, scheduled|active→cancelled.',
  })
  @IsEnum(ShiftStatusEnum)
  status: ShiftStatusEnum;
}
