import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AddInspectionPhotoDto } from './dto/add-inspection-photo.dto';
import { InspectionPhotoResponseDto } from './dto/inspection-photo-response.dto';
import { InspectionPhotoRepository } from './repositories/inspection-photo.repository';
import { InspectionRepository } from './repositories/inspection.repository';

@Injectable()
export class InspectionPhotoService {
  private readonly logger = new Logger(InspectionPhotoService.name);

  constructor(
    private readonly repository: InspectionPhotoRepository,
    private readonly inspectionRepository: InspectionRepository,
  ) {}

  async add(
    inspectionId: string,
    dto: AddInspectionPhotoDto,
  ): Promise<InspectionPhotoResponseDto> {
    if (!Types.ObjectId.isValid(inspectionId)) {
      throw new NotFoundException('Inspection not found');
    }
    const inspection = await this.inspectionRepository.findById(inspectionId);
    if (!inspection) throw new NotFoundException('Inspection not found');

    const created = await this.repository.create({
      inspectionId: inspection._id,
      photoUrl: dto.photoUrl,
      mime: dto.mime,
      size: dto.size,
    });
    this.logger.log('Inspection photo added', {
      inspectionId: inspection._id.toString(),
      photoId: created._id.toString(),
    });
    return InspectionPhotoResponseDto.fromDocument(created);
  }

  async listByInspection(
    inspectionId: string,
  ): Promise<InspectionPhotoResponseDto[]> {
    if (!Types.ObjectId.isValid(inspectionId)) {
      throw new NotFoundException('Inspection not found');
    }
    const inspection = await this.inspectionRepository.findById(inspectionId);
    if (!inspection) throw new NotFoundException('Inspection not found');
    const docs = await this.repository.findByInspection(inspectionId);
    return docs.map((d) => InspectionPhotoResponseDto.fromDocument(d));
  }

  async remove(photoId: string): Promise<void> {
    if (!Types.ObjectId.isValid(photoId)) {
      throw new NotFoundException('Inspection photo not found');
    }
    const ok = await this.repository.deleteById(photoId);
    if (!ok) throw new NotFoundException('Inspection photo not found');
    this.logger.log('Inspection photo removed', { photoId });
  }
}
