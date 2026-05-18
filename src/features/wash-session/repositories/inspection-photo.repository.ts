import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InspectionPhoto,
  InspectionPhotoDocument,
} from '../entities/inspection-photo.entity';
import { PhotoMimeEnum } from '../types/photo-mime.enum';

export interface ICreatePhotoInput {
  inspectionId: Types.ObjectId;
  photoUrl: string;
  mime: PhotoMimeEnum;
  size: number;
}

@Injectable()
export class InspectionPhotoRepository {
  constructor(
    @InjectModel(InspectionPhoto.name)
    private readonly model: Model<InspectionPhotoDocument>,
  ) {}

  async findById(
    id: Types.ObjectId | string,
  ): Promise<InspectionPhotoDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByInspection(
    inspectionId: Types.ObjectId | string,
  ): Promise<InspectionPhotoDocument[]> {
    return this.model
      .find({ inspection_id: new Types.ObjectId(inspectionId) })
      .sort({ _id: 1 })
      .exec();
  }

  async create(input: ICreatePhotoInput): Promise<InspectionPhotoDocument> {
    return this.model.create({
      inspection_id: input.inspectionId,
      photo_url: input.photoUrl,
      mime: input.mime,
      size: input.size,
    });
  }

  async deleteById(id: Types.ObjectId | string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.deleteOne({ _id: id }).exec();
    return result.deletedCount === 1;
  }
}
