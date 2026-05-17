import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderDocument } from '../entities/order.entity';
import { OrderStatusEnum } from '../types/order-status.enum';
import { PaymentMethodEnum } from '../types/payment-method.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';

export class OrderResponseDto {
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

  @ApiProperty({ enum: OrderStatusEnum, example: OrderStatusEnum.CONFIRMED })
  status: OrderStatusEnum;

  @ApiProperty({
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.ONLINE,
  })
  paymentMethod: PaymentMethodEnum;

  @ApiProperty({
    enum: PaymentStatusEnum,
    example: PaymentStatusEnum.PAID,
  })
  paymentStatus: PaymentStatusEnum;

  @ApiProperty({ example: 150000 })
  amount: number;

  @ApiProperty({ example: 0 })
  priorityLevel: number;

  @ApiProperty({ example: 0 })
  rescheduleCount: number;

  @ApiPropertyOptional({ example: 'Khach ban dot xuat' })
  cancelReason?: string;

  @ApiPropertyOptional({ example: 'Hut bui ky phan ghe sau.' })
  note?: string;

  @ApiPropertyOptional({
    example: 'https://pay.payos.vn/web/...',
    description: 'Only present when paymentMethod=online and link not expired',
  })
  payosCheckoutUrl?: string;

  @ApiPropertyOptional({ example: 1716800000001 })
  payosOrderCode?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: OrderDocument): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.vehicleId = doc.vehicle_id.toString();
    dto.serviceTypeId = doc.service_type_id.toString();
    dto.staffShiftId = doc.staff_shift_id.toString();
    dto.scheduledAt = doc.scheduled_at;
    dto.status = doc.status;
    dto.paymentMethod = doc.payment_method;
    dto.paymentStatus = doc.payment_status;
    dto.amount = doc.amount;
    dto.priorityLevel = doc.priority_level;
    dto.rescheduleCount = doc.reschedule_count;
    dto.cancelReason = doc.cancel_reason;
    dto.note = doc.note;
    dto.payosCheckoutUrl = doc.payos_checkout_url;
    dto.payosOrderCode = doc.payos_order_code;
    const ts = doc as unknown as { created_at: Date; updated_at: Date };
    dto.createdAt = ts.created_at;
    dto.updatedAt = ts.updated_at;
    return dto;
  }
}

export class OrderListResponseDto {
  @ApiProperty({ type: OrderResponseDto, isArray: true })
  data: OrderResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
