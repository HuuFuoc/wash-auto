import { ApiProperty } from '@nestjs/swagger';
import { InspectionPhotoDocument } from '../entities/inspection-photo.entity';
import { PhotoMimeEnum } from '../types/photo-mime.enum';

export class InspectionPhotoResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  inspectionId: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/wash-12.jpg',
  })
  photoUrl: string;

  @ApiProperty({ enum: PhotoMimeEnum, example: PhotoMimeEnum.JPEG })
  mime: PhotoMimeEnum;

  @ApiProperty({ example: 250000 })
  size: number;

  @ApiProperty({ example: '2026-06-01T08:35:00.000Z' })
  uploadedAt: Date;

  static fromDocument(
    doc: InspectionPhotoDocument,
  ): InspectionPhotoResponseDto {
    const dto = new InspectionPhotoResponseDto();
    dto.id = doc._id.toString();
    dto.inspectionId = doc.inspection_id.toString();
    dto.photoUrl = doc.photo_url;
    dto.mime = doc.mime;
    dto.size = doc.size;
    // 'uploaded_at' is the timestamps.createdAt alias; mongoose stores it as a Date.
    const docWithTs = doc as unknown as { uploaded_at?: Date };
    dto.uploadedAt = docWithTs.uploaded_at ?? new Date();
    return dto;
  }
}
