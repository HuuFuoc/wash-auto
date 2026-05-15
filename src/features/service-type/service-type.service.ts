import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { ServiceTypeResponseDto } from './dto/service-type-response.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypeRepository } from './repositories/service-type.repository';

@Injectable()
export class ServiceTypeService {
  private readonly logger = new Logger(ServiceTypeService.name);

  constructor(private readonly repository: ServiceTypeRepository) {}

  async listActive(): Promise<ServiceTypeResponseDto[]> {
    const docs = await this.repository.findActive();
    return docs.map((d) => ServiceTypeResponseDto.fromDocument(d));
  }

  async listAll(): Promise<ServiceTypeResponseDto[]> {
    const docs = await this.repository.findAll();
    return docs.map((d) => ServiceTypeResponseDto.fromDocument(d));
  }

  async getById(id: string): Promise<ServiceTypeResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    return ServiceTypeResponseDto.fromDocument(doc);
  }

  async create(dto: CreateServiceTypeDto): Promise<ServiceTypeResponseDto> {
    if (await this.repository.existsByName(dto.name)) {
      throw new ConflictException('Service type name already exists');
    }
    const doc = await this.repository.create({
      name: dto.name,
      description: dto.description,
      basePrice: Types.Decimal128.fromString(dto.basePrice.toString()),
      estimatedMinutes: dto.estimatedMinutes,
      pointsMultiplier: dto.pointsMultiplier,
    });
    this.logger.log('Service type created', { id: doc._id.toString() });
    return ServiceTypeResponseDto.fromDocument(doc);
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
    const doc = await this.repository.update(id, {
      name: dto.name,
      description: dto.description,
      basePrice:
        dto.basePrice !== undefined
          ? Types.Decimal128.fromString(dto.basePrice.toString())
          : undefined,
      estimatedMinutes: dto.estimatedMinutes,
      pointsMultiplier: dto.pointsMultiplier,
    });
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    return ServiceTypeResponseDto.fromDocument(doc);
  }

  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<ServiceTypeResponseDto> {
    const doc = await this.repository.setActive(id, isActive);
    if (!doc) {
      throw new NotFoundException('Service type not found');
    }
    return ServiceTypeResponseDto.fromDocument(doc);
  }
}
