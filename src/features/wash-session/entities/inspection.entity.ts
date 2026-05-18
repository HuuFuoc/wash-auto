import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InspectionPhaseEnum } from '../types/inspection-phase.enum';

export type InspectionDocument = HydratedDocument<Inspection>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'inspections',
})
export class Inspection {
  @Prop({
    type: Types.ObjectId,
    ref: 'WashSession',
    required: true,
    index: true,
  })
  wash_session_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  inspector_id: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(InspectionPhaseEnum),
  })
  phase: InspectionPhaseEnum;

  @Prop({ trim: true })
  damage_notes?: string;

  @Prop({ required: true, default: false })
  customer_acknowledged: boolean;

  @Prop({ trim: true })
  customer_signature_url?: string;
}

export const InspectionSchema = SchemaFactory.createForClass(Inspection);
// Each wash_session has at most 1 inspection per phase (before / after)
InspectionSchema.index({ wash_session_id: 1, phase: 1 }, { unique: true });
InspectionSchema.index({ inspector_id: 1, created_at: -1 });
