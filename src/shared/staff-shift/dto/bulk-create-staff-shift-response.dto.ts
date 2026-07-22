import { ApiProperty } from '../../../common/swagger-shim';
import { ShiftBlockEnum } from '../types/shift-block.enum';
import { StaffShiftResponseDto } from './staff-shift-response.dto';

export type SkippedShiftReason = 'overlap' | 'past';

export class SkippedShiftDto {
  @ApiProperty({
    example: '2026-06-15',
    description: 'VN calendar date skipped.',
  })
  date: string;

  @ApiProperty({ enum: ShiftBlockEnum, example: ShiftBlockEnum.MORNING })
  block: ShiftBlockEnum;

  @ApiProperty({
    example: 'overlap',
    enum: ['overlap', 'past'],
    description:
      '`overlap` = a shift already covers this block; `past` = the block ' +
      'already ended.',
  })
  reason: SkippedShiftReason;
}

export class BulkCreateMetaDto {
  @ApiProperty({
    example: 30,
    description: 'Calendar days selected after the weekday filter.',
  })
  requestedDays: number;

  @ApiProperty({ example: 40 })
  createdCount: number;

  @ApiProperty({ example: 8 })
  skippedCount: number;
}

export class BulkCreateStaffShiftResponseDto {
  @ApiProperty({ type: [StaffShiftResponseDto] })
  created: StaffShiftResponseDto[];

  @ApiProperty({ type: [SkippedShiftDto] })
  skipped: SkippedShiftDto[];

  @ApiProperty({ type: BulkCreateMetaDto })
  meta: BulkCreateMetaDto;
}
