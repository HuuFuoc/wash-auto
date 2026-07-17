import { ApiProperty } from '../../../common/swagger-shim';
import { IsEnum } from 'class-validator';
import { ShiftStatusEnum } from '../types/shift-status.enum';

export class SetStaffShiftStatusDto {
  @ApiProperty({
    enum: ShiftStatusEnum,
    example: ShiftStatusEnum.CANCELLED,
    description:
      'Only `cancelled` is accepted — active/completed are derived from the ' +
      'shift time window automatically.',
  })
  @IsEnum(ShiftStatusEnum)
  status: ShiftStatusEnum;
}
