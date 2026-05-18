import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RoleRepository } from '../auth/repositories/role.repository';
import { UserRepository } from '../auth/repositories/user.repository';
import { RoleEnum } from '../auth/types/role.enum';
import { BookingService } from '../booking/booking.service';
import { BookingRepository } from '../booking/repositories/booking.repository';
import { BookingStatusEnum } from '../booking/types/booking-status.enum';
import { ServiceTypeRepository } from '../service-type/repositories/service-type.repository';
import { VehicleRepository } from '../vehicle/repositories/vehicle.repository';
import { AssignWasherDto } from './dto/assign-washer.dto';
import { CancelWashSessionDto } from './dto/cancel-wash-session.dto';
import { CreateFromBookingDto } from './dto/create-from-booking.dto';
import { CreateWalkInDto } from './dto/create-walk-in.dto';
import { QueryWashSessionDto } from './dto/query-wash-session.dto';
import { WashSessionListResponseDto } from './dto/wash-session-list-response.dto';
import { WashSessionResponseDto } from './dto/wash-session-response.dto';
import { WashSessionDocument } from './entities/wash-session.entity';
import {
  IWashSessionListFilter,
  WashSessionRepository,
} from './repositories/wash-session.repository';
import { WashSessionStatusEnum } from './types/wash-session-status.enum';

@Injectable()
export class WashSessionService {
  private readonly logger = new Logger(WashSessionService.name);

  constructor(
    private readonly repository: WashSessionRepository,
    private readonly bookingRepository: BookingRepository,
    private readonly bookingService: BookingService,
    private readonly vehicleRepository: VehicleRepository,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

  // ---------- CASHIER ----------

  async createFromBooking(
    cashierId: string,
    dto: CreateFromBookingDto,
  ): Promise<WashSessionResponseDto> {
    const booking = await this.bookingRepository.findById(dto.bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    // BR-12: only after confirmed can we open a wash session
    if (
      booking.status !== BookingStatusEnum.CONFIRMED &&
      booking.status !== BookingStatusEnum.PENDING
    ) {
      throw new BadRequestException(
        `Booking status ${booking.status} cannot open a wash session`,
      );
    }

    // 1 booking ↔ at most 1 wash_session
    const existing = await this.repository.findByBookingId(booking._id);
    if (existing) {
      throw new ConflictException(
        'A wash session already exists for this booking',
      );
    }

    const service = await this.serviceTypeRepository.findById(
      booking.service_type_id,
    );
    if (!service) {
      throw new BadRequestException('Linked service type missing');
    }

    const created = await this.repository.create({
      bookingId: booking._id,
      customerId: booking.customer_id,
      vehicleId: booking.vehicle_id,
      serviceTypeId: booking.service_type_id,
      cashierId: new Types.ObjectId(cashierId),
      servicePriceSnapshot: service.base_price,
      note: dto.note,
    });
    this.logger.log('Cashier created wash_session from booking', {
      sessionId: created._id.toString(),
      bookingId: booking._id.toString(),
      cashierId,
    });
    return WashSessionResponseDto.fromDocument(created);
  }

  async createWalkIn(
    cashierId: string,
    dto: CreateWalkInDto,
  ): Promise<WashSessionResponseDto> {
    // Ownership: vehicle must belong to the customer
    const vehicle = await this.vehicleRepository.findByIdForOwner(
      dto.vehicleId,
      dto.customerId,
    );
    if (!vehicle || !vehicle.is_active) {
      throw new BadRequestException(
        'Vehicle not found or does not belong to the given customer',
      );
    }

    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    const created = await this.repository.create({
      customerId: new Types.ObjectId(dto.customerId),
      vehicleId: new Types.ObjectId(dto.vehicleId),
      serviceTypeId: new Types.ObjectId(dto.serviceTypeId),
      cashierId: new Types.ObjectId(cashierId),
      servicePriceSnapshot: service.base_price,
      note: dto.note,
    });
    this.logger.log('Cashier created walk-in wash_session', {
      sessionId: created._id.toString(),
      cashierId,
    });
    return WashSessionResponseDto.fromDocument(created);
  }

  async assignWasher(
    sessionId: string,
    dto: AssignWasherDto,
  ): Promise<WashSessionResponseDto> {
    const session = await this.requireSession(sessionId);
    if (session.status !== WashSessionStatusEnum.WAITING) {
      throw new BadRequestException(
        `Cannot assign washer to session in status ${session.status}`,
      );
    }

    const washerUser = await this.userRepository.findById(dto.washerId);
    if (!washerUser || !washerUser.is_active) {
      throw new BadRequestException('Washer user not found or inactive');
    }
    const role = await this.roleRepository.findById(washerUser.role_id);
    if (!role || role.code !== RoleEnum.WASHER) {
      throw new BadRequestException(
        `User ${dto.washerId} is not a washer (role=${role?.code ?? 'unknown'})`,
      );
    }

    const updated = await this.repository.assignWasher(
      sessionId,
      washerUser._id,
    );
    if (!updated) throw new NotFoundException('Wash session not found');
    return WashSessionResponseDto.fromDocument(updated);
  }

  async cancel(
    sessionId: string,
    dto: CancelWashSessionDto,
  ): Promise<WashSessionResponseDto> {
    const session = await this.requireSession(sessionId);
    if (
      session.status === WashSessionStatusEnum.DONE ||
      session.status === WashSessionStatusEnum.CANCELLED
    ) {
      throw new BadRequestException(
        `Session in status ${session.status} cannot be cancelled`,
      );
    }
    const updated = await this.repository.cancel(sessionId, dto.reason);
    if (!updated) throw new NotFoundException('Wash session not found');
    this.logger.log('Cashier cancelled wash_session', { sessionId });
    return WashSessionResponseDto.fromDocument(updated);
  }

  async adminList(
    query: QueryWashSessionDto,
  ): Promise<WashSessionListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IWashSessionListFilter = {
      status: query.status,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    };
    if (query.customerId)
      filter.customerId = new Types.ObjectId(query.customerId);
    if (query.cashierId) filter.cashierId = new Types.ObjectId(query.cashierId);
    if (query.washerId) filter.washerId = new Types.ObjectId(query.washerId);

    const [docs, total] = await Promise.all([
      this.repository.findPaginated(filter, page, limit),
      this.repository.countMatching(filter),
    ]);
    return {
      data: docs.map((d) => WashSessionResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOne(id: string): Promise<WashSessionResponseDto> {
    const session = await this.requireSession(id);
    return WashSessionResponseDto.fromDocument(session);
  }

  // ---------- WASHER ----------

  async washerListMine(
    washerId: string,
    status?: WashSessionStatusEnum,
  ): Promise<WashSessionResponseDto[]> {
    const docs = await this.repository.findByWasher(washerId, status);
    return docs.map((d) => WashSessionResponseDto.fromDocument(d));
  }

  async washerStart(
    washerId: string,
    sessionId: string,
  ): Promise<WashSessionResponseDto> {
    const session = await this.requireOwnedByWasher(sessionId, washerId);
    if (session.status !== WashSessionStatusEnum.ASSIGNED) {
      throw new BadRequestException(
        `Session must be in ASSIGNED state to start (current: ${session.status})`,
      );
    }
    const updated = await this.repository.recordStart(sessionId);
    if (!updated) throw new NotFoundException('Wash session not found');

    // Auto-sync booking → in_progress
    if (updated.booking_id) {
      await this.bookingService.markInProgressFromSession(updated.booking_id);
    }
    this.logger.log('Washer started wash_session', {
      sessionId,
      washerId,
    });
    return WashSessionResponseDto.fromDocument(updated);
  }

  async washerComplete(
    washerId: string,
    sessionId: string,
  ): Promise<WashSessionResponseDto> {
    const session = await this.requireOwnedByWasher(sessionId, washerId);
    if (session.status !== WashSessionStatusEnum.IN_PROGRESS) {
      throw new BadRequestException(
        `Session must be IN_PROGRESS to complete (current: ${session.status})`,
      );
    }
    const updated = await this.repository.recordComplete(sessionId);
    if (!updated) throw new NotFoundException('Wash session not found');

    // Auto-sync booking → done
    if (updated.booking_id) {
      await this.bookingService.markDoneFromSession(updated.booking_id);
    }
    this.logger.log('Washer completed wash_session', {
      sessionId,
      washerId,
    });
    return WashSessionResponseDto.fromDocument(updated);
  }

  // ---------- CUSTOMER ----------

  async customerListMine(
    customerId: string,
  ): Promise<WashSessionResponseDto[]> {
    const docs = await this.repository.findByOwner(customerId);
    return docs.map((d) => WashSessionResponseDto.fromDocument(d));
  }

  async customerGetMine(
    customerId: string,
    id: string,
  ): Promise<WashSessionResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Wash session not found');
    }
    const doc = await this.repository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Wash session not found');
    return WashSessionResponseDto.fromDocument(doc);
  }

  // ---------- helpers ----------

  private async requireSession(id: string): Promise<WashSessionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Wash session not found');
    }
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Wash session not found');
    return doc;
  }

  private async requireOwnedByWasher(
    id: string,
    washerId: string,
  ): Promise<WashSessionDocument> {
    const session = await this.requireSession(id);
    if (!session.washer_id || session.washer_id.toString() !== washerId) {
      throw new ForbiddenException('This wash session is not assigned to you');
    }
    return session;
  }
}
