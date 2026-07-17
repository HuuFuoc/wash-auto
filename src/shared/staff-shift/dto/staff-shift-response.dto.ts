import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
  StaffShiftDocument,
  effectiveShiftStatus,
} from '../../../modules/staff-shift/staff-shift.model';
import { ShiftStatusEnum } from '../types/shift-status.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class StaffShiftResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Legacy per-staff shifts only. New shifts are anonymous.',
  })
  staffId?: string;

  @ApiProperty({ enum: ShiftTypeEnum, example: ShiftTypeEnum.WASHER })
  shiftType: ShiftTypeEnum;

  @ApiPropertyOptional({
    example: 'Bay 1',
    description: 'Legacy field — no longer settable.',
  })
  stationName?: string;

  @ApiProperty({
    example: 1,
    description: 'Concurrent washes bookable in this shift.',
  })
  capacity: number;

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z' })
  startAt: Date;

  @ApiProperty({ example: '2026-06-01T12:00:00.000Z' })
  endAt: Date;

  @ApiProperty({
    enum: ShiftStatusEnum,
    example: ShiftStatusEnum.SCHEDULED,
    description:
      'Time-derived: scheduled before startAt, active during the window, ' +
      'completed after endAt. Only cancelled is set manually.',
  })
  status: ShiftStatusEnum;

  @ApiPropertyOptional({ example: 'Morning shift' })
  note?: string;

  static fromDocument(doc: StaffShiftDocument): StaffShiftResponseDto {
    const dto = new StaffShiftResponseDto();
    dto.id = doc._id.toString();
    dto.staffId = doc.staff_id?.toString();
    dto.shiftType = doc.shift_type;
    dto.stationName = doc.station_name;
    dto.capacity = doc.capacity ?? 1;
    dto.startAt = doc.start_at;
    dto.endAt = doc.end_at;
    dto.status = effectiveShiftStatus(doc);
    dto.note = doc.note;
    return dto;
  }
}
