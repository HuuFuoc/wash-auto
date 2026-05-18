import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WashSessionDocument } from '../entities/wash-session.entity';
import { WashSessionStatusEnum } from '../types/wash-session-status.enum';

export class WashSessionResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Null for walk-in sessions',
  })
  bookingId?: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  serviceTypeId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  cashierId: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  washerId?: string;

  @ApiProperty({
    example: '80000',
    description: 'Price snapshot at check-in time (Decimal128 as string).',
  })
  servicePriceSnapshot: string;

  @ApiProperty({
    enum: WashSessionStatusEnum,
    example: WashSessionStatusEnum.WAITING,
  })
  status: WashSessionStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-01T08:30:00.000Z' })
  startedAt?: Date;

  @ApiPropertyOptional({ example: '2026-06-01T09:00:00.000Z' })
  completedAt?: Date;

  @ApiPropertyOptional()
  note?: string;

  @ApiPropertyOptional()
  cancelReason?: string;

  static fromDocument(doc: WashSessionDocument): WashSessionResponseDto {
    const dto = new WashSessionResponseDto();
    dto.id = doc._id.toString();
    dto.bookingId = doc.booking_id?.toString();
    dto.customerId = doc.customer_id.toString();
    dto.vehicleId = doc.vehicle_id.toString();
    dto.serviceTypeId = doc.service_type_id.toString();
    dto.cashierId = doc.cashier_id.toString();
    dto.washerId = doc.washer_id?.toString();
    dto.servicePriceSnapshot = doc.service_price_snapshot.toString();
    dto.status = doc.status;
    dto.startedAt = doc.started_at;
    dto.completedAt = doc.completed_at;
    dto.note = doc.note;
    dto.cancelReason = doc.cancel_reason;
    return dto;
  }
}
