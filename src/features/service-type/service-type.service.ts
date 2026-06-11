import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { VehicleTypeRepository } from '../vehicle-type/repositories/vehicle-type.repository';
import {
  CreateServiceTypeDto,
  VehiclePricingDto,
} from './dto/create-service-type.dto';
import { ServiceTypeResponseDto } from './dto/service-type-response.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import {
  IVehiclePricingInput,
  ServiceTypeRepository,
} from './repositories/service-type.repository';

@Injectable()
export class ServiceTypeService {
  private readonly logger = new Logger(ServiceTypeService.name);

  constructor(
    private readonly repository: ServiceTypeRepository,
    private readonly vehicleTypeRepository: VehicleTypeRepository,
  ) {}

  async listActive(): Promise<ServiceTypeResponseDto[]> {
    const docs = await this.repository.findActive();
    const names = await this.buildVehicleTypeNameMap();
    return docs.map((d) => ServiceTypeResponseDto.fromDocument(d, names));
  }

  async listAll(): Promise<ServiceTypeResponseDto[]> {
    const docs = await this.repository.findAll();
    const names = await this.buildVehicleTypeNameMap();
    return docs.map((d) => ServiceTypeResponseDto.fromDocument(d, names));
  }

  async getById(id: string): Promise<ServiceTypeResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    const names = await this.buildVehicleTypeNameMap();
    return ServiceTypeResponseDto.fromDocument(doc, names);
  }

  async create(dto: CreateServiceTypeDto): Promise<ServiceTypeResponseDto> {
    if (await this.repository.existsByName(dto.name)) {
      throw new ConflictException('Service type name already exists');
    }
    await this.validateVehiclePricing(dto.vehiclePricing);
    const doc = await this.repository.create({
      name: dto.name,
      description: dto.description,
      basePrice: Types.Decimal128.fromString(dto.basePrice.toString()),
      estimatedMinutes: dto.estimatedMinutes,
      pointsMultiplier: dto.pointsMultiplier,
      checklistTemplate: dto.checklistTemplate,
      isVoucherEligible: dto.isVoucherEligible,
      vehiclePricing: this.toPricingInput(dto.vehiclePricing),
    });
    this.logger.log('Service type created', { id: doc._id.toString() });
    const names = await this.buildVehicleTypeNameMap();
    return ServiceTypeResponseDto.fromDocument(doc, names);
  }

  async update(
    id: string,
    dto: UpdateServiceTypeDto,
  ): Promise<ServiceTypeResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Service type not found');
    }
    if (dto.name && dto.name !== existing.name) {
      if (await this.repository.existsByName(dto.name)) {
        throw new ConflictException('Service type name already exists');
      }
    }
    await this.validateVehiclePricing(dto.vehiclePricing);
    const doc = await this.repository.update(id, {
      name: dto.name,
      description: dto.description,
      basePrice:
        dto.basePrice !== undefined
          ? Types.Decimal128.fromString(dto.basePrice.toString())
          : undefined,
      estimatedMinutes: dto.estimatedMinutes,
      pointsMultiplier: dto.pointsMultiplier,
      checklistTemplate: dto.checklistTemplate,
      isVoucherEligible: dto.isVoucherEligible,
      vehiclePricing: this.toPricingInput(dto.vehiclePricing),
    });
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    const names = await this.buildVehicleTypeNameMap();
    return ServiceTypeResponseDto.fromDocument(doc, names);
  }

  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<ServiceTypeResponseDto> {
    const doc = await this.repository.setActive(id, isActive);
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    const names = await this.buildVehicleTypeNameMap();
    return ServiceTypeResponseDto.fromDocument(doc, names);
  }

  // ---------- helpers ----------

  /** id→name map of all vehicle types, used to label pricing rows. */
  private async buildVehicleTypeNameMap(): Promise<Map<string, string>> {
    const types = await this.vehicleTypeRepository.findAll();
    return new Map(types.map((t) => [t._id.toString(), t.name]));
  }

  private toPricingInput(
    rows?: VehiclePricingDto[],
  ): IVehiclePricingInput[] | undefined {
    if (rows === undefined) return undefined;
    return rows.map((row) => ({
      vehicleTypeId: row.vehicleTypeId,
      price: Types.Decimal128.fromString(row.price.toString()),
      estimatedMinutes: row.estimatedMinutes,
      isActive: row.isActive,
    }));
  }

  /**
   * Rejects pricing rows that reference a missing vehicle type or repeat the
   * same vehicle type. No-op when `rows` is undefined (field omitted).
   */
  private async validateVehiclePricing(
    rows?: VehiclePricingDto[],
  ): Promise<void> {
    if (!rows || rows.length === 0) return;

    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.vehicleTypeId)) {
        throw new BadRequestException(
          `Duplicate vehicle type in pricing: ${row.vehicleTypeId}`,
        );
      }
      seen.add(row.vehicleTypeId);
    }

    for (const vehicleTypeId of seen) {
      const exists = await this.vehicleTypeRepository.findById(vehicleTypeId);
      if (!exists) {
        throw new BadRequestException(
          `Vehicle type not found: ${vehicleTypeId}`,
        );
      }
    }
  }
}
