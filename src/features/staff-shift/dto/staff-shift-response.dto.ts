import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffShiftDocument } from '../entities/staff-shift.entity';
import { ShiftStatusEnum } from '../types/shift-status.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class StaffShiftResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  staffId: string;

  @ApiProperty({ enum: ShiftTypeEnum, example: ShiftTypeEnum.WASHER })
  shiftType: ShiftTypeEnum;

  @ApiPropertyOptional({ example: 'Bay 1' })
  stationName?: string;

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z' })
  startAt: Date;

  @ApiProperty({ example: '2026-06-01T12:00:00.000Z' })
  endAt: Date;

  @ApiProperty({ enum: ShiftStatusEnum, example: ShiftStatusEnum.SCHEDULED })
  status: ShiftStatusEnum;

  @ApiProperty({ example: 10 })
  maxBookings: number;

  @ApiProperty({ example: 0 })
  currentBookings: number;

  @ApiPropertyOptional({ example: 'Morning shift' })
  note?: string;

  static fromDocument(doc: StaffShiftDocument): StaffShiftResponseDto {
    const dto = new StaffShiftResponseDto();
    dto.id = doc._id.toString();
    dto.staffId = doc.staff_id.toString();
    dto.shiftType = doc.shift_type;
    dto.stationName = doc.station_name;
    dto.startAt = doc.start_at;
    dto.endAt = doc.end_at;
    dto.status = doc.status;
    dto.maxBookings = doc.max_bookings;
    dto.currentBookings = doc.current_bookings;
    dto.note = doc.note;
    return dto;
  }
}
