import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Inspection, InspectionDocument } from '../entities/inspection.entity';
import { InspectionPhaseEnum } from '../types/inspection-phase.enum';

export interface ICreateInspectionInput {
  washSessionId: Types.ObjectId;
  inspectorId: Types.ObjectId;
  phase: InspectionPhaseEnum;
  damageNotes?: string;
  customerSignatureUrl?: string;
}

@Injectable()
export class InspectionRepository {
  constructor(
    @InjectModel(Inspection.name)
    private readonly model: Model<InspectionDocument>,
  ) {}

  async findById(
    id: Types.ObjectId | string,
  ): Promise<InspectionDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findBySession(
    washSessionId: Types.ObjectId | string,
  ): Promise<InspectionDocument[]> {
    return this.model
      .find({ wash_session_id: new Types.ObjectId(washSessionId) })
      .sort({ phase: 1 })
      .exec();
  }

  async findBySessionAndPhase(
    washSessionId: Types.ObjectId | string,
    phase: InspectionPhaseEnum,
  ): Promise<InspectionDocument | null> {
    return this.model
      .findOne({
        wash_session_id: new Types.ObjectId(washSessionId),
        phase,
      })
      .exec();
  }

  async create(input: ICreateInspectionInput): Promise<InspectionDocument> {
    return this.model.create({
      wash_session_id: input.washSessionId,
      inspector_id: input.inspectorId,
      phase: input.phase,
      damage_notes: input.damageNotes,
      customer_signature_url: input.customerSignatureUrl,
      customer_acknowledged: false,
    });
  }

  async setAcknowledged(
    id: Types.ObjectId | string,
    customerSignatureUrl?: string,
  ): Promise<InspectionDocument | null> {
    const update: Record<string, unknown> = { customer_acknowledged: true };
    if (customerSignatureUrl !== undefined) {
      update.customer_signature_url = customerSignatureUrl;
    }
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }
}
