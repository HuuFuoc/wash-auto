import { Module } from '@nestjs/common';
import { CloudinaryProvider } from './cloudinary.config';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/**
 * Bundles the Cloudinary-backed image upload feature. {@link UploadService} is
 * exported so other feature modules can reuse it (e.g. attaching photos to
 * orders or work orders) without re-declaring the Cloudinary provider.
 */
@Module({
  controllers: [UploadController],
  providers: [CloudinaryProvider, UploadService],
  exports: [UploadService],
})
export class UploadModule {}
