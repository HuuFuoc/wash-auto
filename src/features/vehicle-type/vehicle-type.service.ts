import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';
import { VehicleTypeResponseDto } from './dto/vehicle-type-response.dto';
import { VehicleTypeRepository } from './repositories/vehicle-type.repository';

@Injectable()
export class VehicleTypeService {
  private readonly logger = new Logger(VehicleTypeService.name);

  constructor(private readonly repository: VehicleTypeRepository) {}

  async listActive(): Promise<VehicleTypeResponseDto[]> {
    const docs = await this.repository.findActive();
    return docs.map((d) => VehicleTypeResponseDto.fromDocument(d));
  }

  async listAll(): Promise<VehicleTypeResponseDto[]> {
    const docs = await this.repository.findAll();
    return docs.map((d) => VehicleTypeResponseDto.fromDocument(d));
  }

  async getById(id: string): Promise<VehicleTypeResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) {
      throw new NotFoundException('Vehicle type not found');
    }
    return VehicleTypeResponseDto.fromDocument(doc);
  }

  async create(dto: CreateVehicleTypeDto): Promise<VehicleTypeResponseDto> {
    if (await this.repository.existsByName(dto.name)) {
      throw new ConflictException('Vehicle type name already exists');
    }
    const doc = await this.repository.create({
      name: dto.name,
      description: dto.description,
    });
    this.logger.log('Vehicle type created', { id: doc._id.toString() });
    return VehicleTypeResponseDto.fromDocument(doc);
  }

  async update(
    id: string,
    dto: UpdateVehicleTypeDto,
  ): Promise<VehicleTypeResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Vehicle type not found');
    }
    if (dto.name && dto.name !== existing.name) {
      if (await this.repository.existsByName(dto.name)) {
        throw new ConflictException('Vehicle type name already exists');
      }
    }
    const doc = await this.repository.update(id, {
      name: dto.name,
      description: dto.description,
    });
    if (!doc) {
      throw new NotFoundException('Vehicle type not found');
    }
    return VehicleTypeResponseDto.fromDocument(doc);
  }

  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<VehicleTypeResponseDto> {
    const doc = await this.repository.setActive(id, isActive);
    if (!doc) {
      throw new NotFoundException('Vehicle type not found');
    }
    return VehicleTypeResponseDto.fromDocument(doc);
  }
}
