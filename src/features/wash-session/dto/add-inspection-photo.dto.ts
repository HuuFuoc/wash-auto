import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { PhotoMimeEnum } from '../types/photo-mime.enum';

export class AddInspectionPhotoDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/wash-12.jpg',
    description:
      'Direct URL to the already-uploaded image (Cloudinary/S3/etc).',
  })
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  photoUrl: string;

  @ApiProperty({
    enum: PhotoMimeEnum,
    example: PhotoMimeEnum.JPEG,
  })
  @IsEnum(PhotoMimeEnum)
  mime: PhotoMimeEnum;

  @ApiProperty({
    example: 250_000,
    minimum: 1,
    maximum: 10_000_000,
    description: 'Size in bytes (max 10MB).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  size: number;
}
