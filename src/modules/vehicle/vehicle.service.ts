import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions';
import { CreateVehicleDto } from '../../shared/vehicle/dto/create-vehicle.dto';
import { QueryVehicleDto } from '../../shared/vehicle/dto/query-vehicle.dto';
import { UpdateVehicleDto } from '../../shared/vehicle/dto/update-vehicle.dto';
import { VehicleListResponseDto } from '../../shared/vehicle/dto/vehicle-list-response.dto';
import { VehicleResponseDto } from '../../shared/vehicle/dto/vehicle-response.dto';
import { VehicleTypeRepository } from '../vehicle-type/vehicle-type.repository';
import { VehicleDocument } from './vehicle.model';
import { IVehicleListFilter, VehicleRepository } from './vehicle.repository';

// Business logic copied verbatim from features/vehicle/vehicle.service.ts;
// only DI + Nest exceptions + Logger were swapped out.
export class VehicleService {
  constructor(
    private readonly vehicleRepository: VehicleRepository,
    private readonly vehicleTypeRepository: VehicleTypeRepository,
  ) {}

  async listOwn(customerId: string): Promise<VehicleResponseDto[]> {
    const docs = await this.vehicleRepository.findByOwner(customerId);
    return docs.map((d) => VehicleResponseDto.fromDocument(d));
  }

  async getOwn(customerId: string, id: string): Promise<VehicleResponseDto> {
    const doc = await this.requireOwned(id, customerId);
    return VehicleResponseDto.fromDocument(doc);
  }

  async createOwn(
    customerId: string,
    dto: CreateVehicleDto,
  ): Promise<VehicleResponseDto> {
    await this.requireActiveVehicleType(dto.vehicleTypeId);
    const plate = dto.licensePlate.trim();
    if (await this.vehicleRepository.existsByLicensePlate(plate)) {
      throw new ConflictException('License plate already registered');
    }

    const hasAnyExisting =
      await this.vehicleRepository.hasAnyActiveOwned(customerId);
    const desiredDefault = dto.isDefault ?? !hasAnyExisting;

    const customerObjId = new Types.ObjectId(customerId);
    const created = await this.vehicleRepository.create({
      customerId: customerObjId,
      vehicleTypeId: new Types.ObjectId(dto.vehicleTypeId),
      licensePlate: plate,
      nickname: dto.nickname,
      brand: dto.brand,
      carModel: dto.model,
      color: dto.color,
      isDefault: desiredDefault,
    });

    if (desiredDefault) {
      await this.vehicleRepository.unsetDefaultForOwner(
        customerId,
        created._id,
      );
    }

    console.log('Customer added vehicle', {
      vehicleId: created._id.toString(),
      customerId,
    });
    return VehicleResponseDto.fromDocument(created);
  }

  async updateOwn(
    customerId: string,
    id: string,
    dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    const existing = await this.requireOwned(id, customerId);

    if (
      dto.licensePlate &&
      dto.licensePlate.trim() !== existing.license_plate
    ) {
      const plate = dto.licensePlate.trim();
      if (
        await this.vehicleRepository.existsByLicensePlateExcept(
          plate,
          existing._id,
        )
      ) {
        throw new ConflictException('License plate already registered');
      }
    }

    if (
      dto.vehicleTypeId &&
      dto.vehicleTypeId !== existing.vehicle_type_id.toString()
    ) {
      await this.requireActiveVehicleType(dto.vehicleTypeId);
    }

    const updated = await this.vehicleRepository.updateById(id, {
      vehicleTypeId: dto.vehicleTypeId
        ? new Types.ObjectId(dto.vehicleTypeId)
        : undefined,
      licensePlate: dto.licensePlate?.trim(),
      nickname: dto.nickname,
      brand: dto.brand,
      carModel: dto.model,
      color: dto.color,
    });
    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }
    return VehicleResponseDto.fromDocument(updated);
  }

  async setDefaultOwn(
    customerId: string,
    id: string,
  ): Promise<VehicleResponseDto> {
    const existing = await this.requireOwned(id, customerId);
    if (!existing.is_active) {
      throw new BadRequestException('Cannot set inactive vehicle as default');
    }

    const updated = await this.vehicleRepository.updateById(id, {
      isDefault: true,
    });
    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }
    await this.vehicleRepository.unsetDefaultForOwner(customerId, id);
    return VehicleResponseDto.fromDocument(updated);
  }

  async softDeleteOwn(customerId: string, id: string): Promise<void> {
    const existing = await this.requireOwned(id, customerId);
    if (!existing.is_active) return;

    const updated = await this.vehicleRepository.updateById(id, {
      isActive: false,
      isDefault: false,
    });
    if (!updated) {
      throw new NotFoundException('Vehicle not found');
    }
    console.log('Customer removed vehicle', {
      vehicleId: id,
      customerId,
    });
  }

  // ---------- admin ----------

  async adminList(query: QueryVehicleDto): Promise<VehicleListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IVehicleListFilter = {
      isActive: query.isActive,
      licensePlateLike: query.licensePlate,
    };
    if (query.customerId)
      filter.customerId = new Types.ObjectId(query.customerId);
    if (query.vehicleTypeId)
      filter.vehicleTypeId = new Types.ObjectId(query.vehicleTypeId);

    const [docs, total] = await Promise.all([
      this.vehicleRepository.findPaginated(filter, page, limit),
      this.vehicleRepository.countMatching(filter),
    ]);

    return {
      data: docs.map((d) => VehicleResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOne(id: string): Promise<VehicleResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid vehicle id');
    }
    const doc = await this.vehicleRepository.findById(id);
    if (!doc) throw new NotFoundException('Vehicle not found');
    return VehicleResponseDto.fromDocument(doc);
  }

  // ---------- helpers ----------

  private async requireOwned(
    id: string,
    customerId: string,
  ): Promise<VehicleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Vehicle not found');
    }
    const doc = await this.vehicleRepository.findByIdForOwner(id, customerId);
    if (!doc) {
      // Do not leak whether the vehicle exists for another customer
      throw new NotFoundException('Vehicle not found');
    }
    return doc;
  }

  private async requireActiveVehicleType(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid vehicleTypeId');
    }
    const vt = await this.vehicleTypeRepository.findById(id);
    if (!vt || !vt.is_active) {
      throw new BadRequestException('Vehicle type not found or inactive');
    }
  }

  /** Reserved for cross-feature use (booking flow may need ownership-checked vehicle docs). */
  async assertVehicleOwnership(
    customerId: string,
    id: string,
  ): Promise<VehicleDocument> {
    const doc = await this.requireOwned(id, customerId);
    if (!doc.is_active) {
      throw new ForbiddenException('Vehicle is inactive');
    }
    return doc;
  }
}
