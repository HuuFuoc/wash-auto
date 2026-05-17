import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingDocument } from '../entities/booking.entity';
import { BookingStatusEnum } from '../types/booking-status.enum';

export class BookingResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  serviceTypeId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  staffShiftId: string;

  @ApiProperty({ example: '2026-06-01T09:00:00.000Z' })
  scheduledAt: Date;

  @ApiProperty({ enum: BookingStatusEnum, example: BookingStatusEnum.PENDING })
  status: BookingStatusEnum;

  @ApiProperty({ example: 0 })
  priorityLevel: number;

  @ApiProperty({ example: 0 })
  rescheduleCount: number;

  @ApiPropertyOptional({ example: 'Khách bận đột xuất' })
  cancelReason?: string;

  @ApiPropertyOptional({
    example: 'Hút bụi kỹ phần ghế sau, xe bám lông chó.',
  })
  note?: string;

  static fromDocument(doc: BookingDocument): BookingResponseDto {
    const dto = new BookingResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.vehicleId = doc.vehicle_id.toString();
    dto.serviceTypeId = doc.service_type_id.toString();
    dto.staffShiftId = doc.staff_shift_id.toString();
    dto.scheduledAt = doc.scheduled_at;
    dto.status = doc.status;
    dto.priorityLevel = doc.priority_level;
    dto.rescheduleCount = doc.reschedule_count;
    dto.cancelReason = doc.cancel_reason;
    dto.note = doc.note;
    return dto;
  }
}
