import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PhotoMimeEnum } from '../types/photo-mime.enum';

export type InspectionPhotoDocument = HydratedDocument<InspectionPhoto>;

@Schema({
  timestamps: { createdAt: 'uploaded_at', updatedAt: false },
  collection: 'inspection_photos',
})
export class InspectionPhoto {
  @Prop({
    type: Types.ObjectId,
    ref: 'Inspection',
    required: true,
    index: true,
  })
  inspection_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  photo_url: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(PhotoMimeEnum),
  })
  mime: PhotoMimeEnum;

  @Prop({ required: true, min: 1, max: 10_000_000 })
  size: number;
}

export const InspectionPhotoSchema =
  SchemaFactory.createForClass(InspectionPhoto);
