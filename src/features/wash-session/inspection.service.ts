import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AcknowledgeInspectionDto } from './dto/acknowledge-inspection.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { InspectionResponseDto } from './dto/inspection-response.dto';
import { InspectionRepository } from './repositories/inspection.repository';
import { WashSessionRepository } from './repositories/wash-session.repository';
import { InspectionPhaseEnum } from './types/inspection-phase.enum';
import { WashSessionStatusEnum } from './types/wash-session-status.enum';

@Injectable()
export class InspectionService {
  private readonly logger = new Logger(InspectionService.name);

  constructor(
    private readonly repository: InspectionRepository,
    private readonly washSessionRepository: WashSessionRepository,
  ) {}

  async create(
    inspectorId: string,
    sessionId: string,
    dto: CreateInspectionDto,
  ): Promise<InspectionResponseDto> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Wash session not found');
    }
    const session = await this.washSessionRepository.findById(sessionId);
    if (!session) throw new NotFoundException('Wash session not found');

    if (dto.phase === InspectionPhaseEnum.BEFORE) {
      // BEFORE inspection must happen before the wash starts
      if (
        session.status !== WashSessionStatusEnum.WAITING &&
        session.status !== WashSessionStatusEnum.ASSIGNED
      ) {
        throw new BadRequestException(
          `Inspection 'before' must be created while session is WAITING or ASSIGNED (current: ${session.status})`,
        );
      }
    } else {
      // AFTER inspection must happen after the wash is done
      if (session.status !== WashSessionStatusEnum.DONE) {
        throw new BadRequestException(
          `Inspection 'after' must be created when session is DONE (current: ${session.status})`,
        );
      }
    }

    // Prevent duplicate (unique index will also enforce, but provide nicer error)
    const existing = await this.repository.findBySessionAndPhase(
      session._id,
      dto.phase,
    );
    if (existing) {
      throw new ConflictException(
        `Inspection '${dto.phase}' already exists for this session`,
      );
    }

    const created = await this.repository.create({
      washSessionId: session._id,
      inspectorId: new Types.ObjectId(inspectorId),
      phase: dto.phase,
      damageNotes: dto.damageNotes,
      customerSignatureUrl: dto.customerSignatureUrl,
    });
    this.logger.log('Inspection created', {
      sessionId: session._id.toString(),
      phase: dto.phase,
      inspectorId,
    });
    return InspectionResponseDto.fromDocument(created);
  }

  async listBySession(sessionId: string): Promise<InspectionResponseDto[]> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Wash session not found');
    }
    const session = await this.washSessionRepository.findById(sessionId);
    if (!session) throw new NotFoundException('Wash session not found');
    const docs = await this.repository.findBySession(sessionId);
    return docs.map((d) => InspectionResponseDto.fromDocument(d));
  }

  async acknowledge(
    inspectionId: string,
    dto: AcknowledgeInspectionDto,
  ): Promise<InspectionResponseDto> {
    if (!Types.ObjectId.isValid(inspectionId)) {
      throw new NotFoundException('Inspection not found');
    }
    const inspection = await this.repository.findById(inspectionId);
    if (!inspection) throw new NotFoundException('Inspection not found');

    const updated = await this.repository.setAcknowledged(
      inspectionId,
      dto.customerSignatureUrl,
    );
    if (!updated) throw new NotFoundException('Inspection not found');
    return InspectionResponseDto.fromDocument(updated);
  }
}
