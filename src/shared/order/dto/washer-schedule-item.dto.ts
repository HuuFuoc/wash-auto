import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Types } from 'mongoose';
import { OrderDocument } from '../../../modules/order/order.model';
import { OrderStatusEnum } from '../types/order-status.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';

/**
 * A ref is "populated" when the query used `.populate()` - it becomes the
 * referenced sub-document instead of a raw ObjectId. The schedule finder
 * populates customer/vehicle/service/shift, but a populate against an orphaned
 * ref (target deleted) yields null, so each branch tolerates a missing ref.
 */
function isPopulated(
  ref: unknown,
): ref is { _id: Types.ObjectId; [key: string]: unknown } {
  return typeof ref === 'object' && ref !== null && '_id' in ref;
}

export class ScheduleServiceDto {
  @ApiPropertyOptional({ example: 'Premium Wash' })
  name?: string;

  @ApiProperty({
    example: 30,
    description: 'Wash duration in minutes, snapshotted on the booking.',
  })
  durationMinutes: number;
}

export class ScheduleCustomerDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  name?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  phone?: string;
}

export class ScheduleVehicleDto {
  @ApiPropertyOptional({ example: '51T-56019' })
  licensePlate?: string;
}

/** One booking on a washer's schedule. */
export class WasherScheduleItemDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  bookingId: string;

  @ApiProperty({ example: '2026-06-16T09:00:00.000Z' })
  scheduledAt: Date;

  @ApiProperty({ enum: OrderStatusEnum, example: OrderStatusEnum.CONFIRMED })
  status: OrderStatusEnum;

  @ApiProperty({ type: ScheduleServiceDto })
  service: ScheduleServiceDto;

  @ApiProperty({ type: ScheduleCustomerDto })
  customer: ScheduleCustomerDto;

  @ApiProperty({ type: ScheduleVehicleDto })
  vehicle: ScheduleVehicleDto;

  @ApiPropertyOptional({
    example: 'Bay 2',
    description: 'Station the booked shift is assigned to, if any.',
  })
  location?: string;

  @ApiProperty({ enum: PaymentStatusEnum, example: PaymentStatusEnum.PAID })
  paymentStatus: PaymentStatusEnum;

  static fromDocument(doc: OrderDocument): WasherScheduleItemDto {
    const dto = new WasherScheduleItemDto();
    dto.bookingId = doc._id.toString();
    dto.scheduledAt = doc.scheduled_at;
    dto.status = doc.status;
    dto.paymentStatus = doc.payment_status;

    // Duration is the value agreed at booking (varies by vehicle type), kept on
    // the order itself; the service ref only contributes the display name.
    const service = new ScheduleServiceDto();
    service.durationMinutes = doc.estimated_minutes;
    const svc = doc.service_type_id as unknown;
    if (isPopulated(svc)) service.name = svc.name as string | undefined;
    dto.service = service;

    const customer = new ScheduleCustomerDto();
    const cust = doc.customer_id as unknown;
    if (isPopulated(cust)) {
      customer.name = cust.name as string | undefined;
      customer.phone = cust.phone as string | undefined;
    }
    dto.customer = customer;

    const vehicle = new ScheduleVehicleDto();
    const veh = doc.vehicle_id as unknown;
    if (isPopulated(veh)) {
      vehicle.licensePlate = veh.license_plate as string | undefined;
    }
    dto.vehicle = vehicle;

    const shift = doc.staff_shift_id as unknown;
    if (isPopulated(shift)) {
      dto.location = shift.station_name as string | undefined;
    }

    return dto;
  }
}
