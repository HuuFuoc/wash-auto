import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { OrderDocument } from '../entities/order.entity';
import { OrderStatusEnum } from '../types/order-status.enum';
import { PaymentMethodEnum } from '../types/payment-method.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';

/**
 * A ref field is "populated" when the query used `.populate()` (admin list) -
 * it becomes the referenced sub-document instead of a raw ObjectId. Other
 * callers leave it as an ObjectId, so the DTO handles both shapes.
 */
function isPopulated(
  ref: unknown,
): ref is { _id: Types.ObjectId; [key: string]: unknown } {
  return typeof ref === 'object' && ref !== null && '_id' in ref;
}

export class OrderResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  serviceTypeId: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description: 'Customer name. Present only when the list is populated.',
  })
  customerName?: string;

  @ApiPropertyOptional({ example: 'a@example.com' })
  customerEmail?: string;

  @ApiPropertyOptional({ example: '51T-56019' })
  licensePlate?: string;

  @ApiPropertyOptional({ example: 'Premium Wash' })
  serviceName?: string;

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

  @ApiProperty({
    example: 150000,
    description: 'Final amount the customer pays (after discount/voucher).',
  })
  amount: number;

  @ApiProperty({
    example: 150000,
    description: 'Service base price before discounts.',
  })
  originalAmount: number;

  @ApiProperty({
    example: 15000,
    description: 'VND knocked off original_amount.',
  })
  discountAmount: number;

  @ApiProperty({
    example: 10,
    description: 'Percent discount applied (golden hour + tier).',
  })
  discountPercent: number;

  @ApiPropertyOptional({ example: 'golden_hour:Bronze' })
  discountReason?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  voucherId?: string;

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

    // Refs are populated on the admin list, raw ObjectIds elsewhere. A
    // populate() against an orphaned ref (target doc deleted) yields null,
    // so every branch tolerates a missing/null ref instead of crashing.
    const cust = doc.customer_id as unknown;
    if (isPopulated(cust)) {
      dto.customerId = cust._id.toString();
      dto.customerName = cust.name as string | undefined;
      dto.customerEmail = cust.email as string | undefined;
    } else {
      dto.customerId = cust ? (cust as Types.ObjectId).toString() : '';
    }

    const veh = doc.vehicle_id as unknown;
    if (isPopulated(veh)) {
      dto.vehicleId = veh._id.toString();
      dto.licensePlate = veh.license_plate as string | undefined;
    } else {
      dto.vehicleId = veh ? (veh as Types.ObjectId).toString() : '';
    }

    const svc = doc.service_type_id as unknown;
    if (isPopulated(svc)) {
      dto.serviceTypeId = svc._id.toString();
      dto.serviceName = svc.name as string | undefined;
    } else {
      dto.serviceTypeId = svc ? (svc as Types.ObjectId).toString() : '';
    }

    dto.staffShiftId = doc.staff_shift_id?.toString() ?? '';
    dto.scheduledAt = doc.scheduled_at;
    dto.status = doc.status;
    dto.paymentMethod = doc.payment_method;
    dto.paymentStatus = doc.payment_status;
    dto.amount = doc.amount;
    dto.originalAmount = doc.original_amount;
    dto.discountAmount = doc.discount_amount;
    dto.discountPercent = doc.discount_percent;
    dto.discountReason = doc.discount_reason;
    dto.voucherId = doc.voucher_id?.toString();
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
