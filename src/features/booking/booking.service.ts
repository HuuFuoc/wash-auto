import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { UserRepository } from '../auth/repositories/user.repository';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ServiceTypeRepository } from '../service-type/repositories/service-type.repository';
import { StaffShiftRepository } from '../staff-shift/repositories/staff-shift.repository';
import { ShiftStatusEnum } from '../staff-shift/types/shift-status.enum';
import { TierConfigRepository } from '../tier-config/repositories/tier-config.repository';
import { VehicleRepository } from '../vehicle/repositories/vehicle.repository';
import {
  isCancellableByOwner,
  isValidBookingTransition,
  consumesShiftCapacity,
} from './booking.state-machine';
import { BookingListResponseDto } from './dto/booking-list-response.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { BookingDocument } from './entities/booking.entity';
import {
  BookingRepository,
  IBookingListFilter,
} from './repositories/booking.repository';
import { BookingStatusEnum } from './types/booking-status.enum';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly loyaltyService: LoyaltyService,
    private readonly configService: ConfigService,
  ) {}

  // ---------- CUSTOMER ----------

  async createBooking(
    customerId: string,
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    // 1) Validate vehicle ownership
    const vehicle = await this.vehicleRepository.findByIdForOwner(
      dto.vehicleId,
      customerId,
    );
    if (!vehicle || !vehicle.is_active) {
      throw new NotFoundException('Vehicle not found');
    }

    // 2) Validate service_type active
    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    // 3) Validate shift state + scheduled_at in shift window
    const shift = await this.staffShiftRepository.findById(dto.staffShiftId);
    if (!shift || shift.status !== ShiftStatusEnum.SCHEDULED) {
      throw new BadRequestException('Shift not available for booking');
    }
    if (dto.scheduledAt < shift.start_at || dto.scheduledAt > shift.end_at) {
      throw new BadRequestException(
        'scheduledAt is outside the selected shift window',
      );
    }
    if (dto.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    // 3b) Service duration must fit inside the remaining shift window
    const finishMs =
      dto.scheduledAt.getTime() + service.estimated_minutes * 60_000;
    if (finishMs > shift.end_at.getTime()) {
      throw new BadRequestException(
        `Service requires ${service.estimated_minutes} min and would overrun the shift end at ${shift.end_at.toISOString()}`,
      );
    }

    // 4) Tier window check (BR-06)
    const loyaltyAccount =
      await this.loyaltyService.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      loyaltyAccount.tier_config_id,
    );
    if (!tier) {
      throw new BadRequestException('Tier config missing for this customer');
    }
    const maxScheduledMs =
      Date.now() + tier.booking_window_days * 24 * 60 * 60 * 1000;
    if (dto.scheduledAt.getTime() > maxScheduledMs) {
      throw new BadRequestException(
        `scheduledAt exceeds your tier booking window (${tier.booking_window_days} days)`,
      );
    }

    // 5) Active booking cap (BR-08 style)
    const maxActive = this.configService.getOrThrow<number>(
      'booking.maxActivePerCustomer',
    );
    const active =
      await this.bookingRepository.countActiveByCustomer(customerId);
    if (active >= maxActive) {
      throw new BadRequestException(
        `You already have ${active} active bookings (limit ${maxActive})`,
      );
    }

    // 6) Atomic capacity reservation (BR-07)
    const reserved = await this.staffShiftRepository.incrementCurrentBookings(
      dto.staffShiftId,
    );
    if (!reserved) {
      throw new ConflictException('Shift is full');
    }

    // 7) Create booking; rollback on failure
    try {
      const booking = await this.bookingRepository.create({
        customerId: new Types.ObjectId(customerId),
        vehicleId: new Types.ObjectId(dto.vehicleId),
        serviceTypeId: new Types.ObjectId(dto.serviceTypeId),
        staffShiftId: new Types.ObjectId(dto.staffShiftId),
        scheduledAt: dto.scheduledAt,
        priorityLevel: tier.priority_level,
        note: dto.note,
      });
      this.logger.log('Customer created booking', {
        bookingId: booking._id.toString(),
        customerId,
        shiftId: dto.staffShiftId,
      });
      return BookingResponseDto.fromDocument(booking);
    } catch (error) {
      await this.staffShiftRepository.decrementCurrentBookings(
        dto.staffShiftId,
      );
      throw error;
    }
  }

  async listOwn(customerId: string): Promise<BookingResponseDto[]> {
    const docs = await this.bookingRepository.findByOwner(customerId);
    return docs.map((d) => BookingResponseDto.fromDocument(d));
  }

  async getOwn(customerId: string, id: string): Promise<BookingResponseDto> {
    const doc = await this.requireOwned(id, customerId);
    return BookingResponseDto.fromDocument(doc);
  }

  async rescheduleOwn(
    customerId: string,
    id: string,
    dto: RescheduleBookingDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.requireOwned(id, customerId);
    if (
      booking.status !== BookingStatusEnum.PENDING &&
      booking.status !== BookingStatusEnum.CONFIRMED
    ) {
      throw new BadRequestException(
        'Only pending or confirmed bookings can be rescheduled',
      );
    }
    const maxReschedules = this.configService.getOrThrow<number>(
      'booking.maxReschedules',
    );
    if (booking.reschedule_count >= maxReschedules) {
      throw new BadRequestException(
        `Reschedule limit reached (${maxReschedules})`,
      );
    }

    // Validate new shift
    const newShift = await this.staffShiftRepository.findById(dto.staffShiftId);
    if (!newShift || newShift.status !== ShiftStatusEnum.SCHEDULED) {
      throw new BadRequestException('New shift not available');
    }
    if (
      dto.scheduledAt < newShift.start_at ||
      dto.scheduledAt > newShift.end_at
    ) {
      throw new BadRequestException(
        'scheduledAt is outside the new shift window',
      );
    }
    if (dto.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    // Service duration must fit in new shift window too
    const service = await this.serviceTypeRepository.findById(
      booking.service_type_id,
    );
    if (!service) {
      throw new BadRequestException('Original service type missing');
    }
    const finishMs =
      dto.scheduledAt.getTime() + service.estimated_minutes * 60_000;
    if (finishMs > newShift.end_at.getTime()) {
      throw new BadRequestException(
        `Service requires ${service.estimated_minutes} min and would overrun the new shift end`,
      );
    }

    // Reserve new slot first; rollback by releasing it on failure
    const reserved = await this.staffShiftRepository.incrementCurrentBookings(
      dto.staffShiftId,
    );
    if (!reserved) {
      throw new ConflictException('New shift is full');
    }

    try {
      const updated = await this.bookingRepository.applyReschedule(
        id,
        new Types.ObjectId(dto.staffShiftId),
        dto.scheduledAt,
      );
      if (!updated) {
        throw new NotFoundException('Booking not found');
      }
      // Release the old slot
      await this.staffShiftRepository.decrementCurrentBookings(
        booking.staff_shift_id,
      );
      this.logger.log('Customer rescheduled booking', {
        bookingId: id,
        newShiftId: dto.staffShiftId,
      });
      return BookingResponseDto.fromDocument(updated);
    } catch (error) {
      // Release the newly reserved slot
      await this.staffShiftRepository.decrementCurrentBookings(
        dto.staffShiftId,
      );
      throw error;
    }
  }

  async cancelOwn(
    customerId: string,
    id: string,
    dto: CancelBookingDto,
  ): Promise<BookingResponseDto> {
    const booking = await this.requireOwned(id, customerId);
    if (!isCancellableByOwner(booking.status)) {
      throw new BadRequestException(
        `Booking in status ${booking.status} cannot be cancelled by customer`,
      );
    }
    if (consumesShiftCapacity(booking.status)) {
      await this.staffShiftRepository.decrementCurrentBookings(
        booking.staff_shift_id,
      );
    }
    const updated = await this.bookingRepository.setStatus(
      id,
      BookingStatusEnum.CANCELLED,
      dto.reason ?? 'Cancelled by customer',
    );
    if (!updated) throw new NotFoundException('Booking not found');
    return BookingResponseDto.fromDocument(updated);
  }

  // ---------- STAFF / ADMIN ----------

  async adminList(query: QueryBookingDto): Promise<BookingListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IBookingListFilter = {
      status: query.status,
      scheduledFrom: query.scheduledFrom,
      scheduledTo: query.scheduledTo,
    };

    if (query.customerId) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }

    if (query.customerPhone) {
      const customerIds = await this.userRepository.findIdsByPhoneLike(
        query.customerPhone,
      );
      if (customerIds.length === 0) {
        return {
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
      filter.customerIds = customerIds;
    }

    if (query.vehicleLicensePlate) {
      const vehicleIds = await this.vehicleRepository.findIdsByLicensePlateLike(
        query.vehicleLicensePlate,
      );
      if (vehicleIds.length === 0) {
        return {
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
      filter.vehicleIds = vehicleIds;
    }

    const [docs, total] = await Promise.all([
      this.bookingRepository.findPaginated(filter, page, limit),
      this.bookingRepository.countMatching(filter),
    ]);
    return {
      data: docs.map((d) => BookingResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOne(id: string): Promise<BookingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Booking not found');
    }
    const doc = await this.bookingRepository.findById(id);
    if (!doc) throw new NotFoundException('Booking not found');
    return BookingResponseDto.fromDocument(doc);
  }

  async adminUpdateStatus(
    id: string,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Booking not found');
    }
    const booking = await this.bookingRepository.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');

    if (!isValidBookingTransition(booking.status, dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${booking.status} → ${dto.status}`,
      );
    }
    if (booking.status === dto.status) {
      return BookingResponseDto.fromDocument(booking);
    }

    // Release shift slot if transitioning out of an active state into a terminal one
    if (
      consumesShiftCapacity(booking.status) &&
      !consumesShiftCapacity(dto.status)
    ) {
      await this.staffShiftRepository.decrementCurrentBookings(
        booking.staff_shift_id,
      );
    }

    const cancelReason =
      dto.status === BookingStatusEnum.CANCELLED ||
      dto.status === BookingStatusEnum.NO_SHOW
        ? (dto.reason ?? `Set by staff to ${dto.status}`)
        : undefined;

    const updated = await this.bookingRepository.setStatus(
      id,
      dto.status,
      cancelReason,
    );
    if (!updated) throw new NotFoundException('Booking not found');
    this.logger.log('Staff updated booking status', {
      bookingId: id,
      from: booking.status,
      to: dto.status,
    });
    return BookingResponseDto.fromDocument(updated);
  }

  // ---------- helpers ----------

  private async requireOwned(
    id: string,
    customerId: string,
  ): Promise<BookingDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Booking not found');
    }
    const doc = await this.bookingRepository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Booking not found');
    return doc;
  }

  /** Reserved for future cross-feature checks (e.g. wash-session must have a confirmed/in_progress booking). */
  ensureCanStart(_booking: BookingDocument): void {
    if (_booking.status !== BookingStatusEnum.CONFIRMED) {
      throw new ForbiddenException(
        `Cannot start wash from booking status ${_booking.status}`,
      );
    }
  }
}
