import { Request, Response } from 'express';
import { UnprocessableEntityException } from '../../common/exceptions';
import { UploadService } from './upload.service';

/** Maximum accepted upload size: 5 MB. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Reproduces Nest's ParseFilePipeBuilder (file required + image mimetype +
// 5 MB cap), all rejecting with 422 Unprocessable Entity. The Multer fileSize
// limit (→ 413) and file-count limit (→ 400) are handled in the router.
function assertImage(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) {
    throw new UnprocessableEntityException('File is required');
  }
  if (!/^image\//.test(file.mimetype)) {
    throw new UnprocessableEntityException(
      `Validation failed (current file type is ${file.mimetype}, expected type is /^image\\//)`,
    );
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new UnprocessableEntityException(
      `Validation failed (expected size is less than ${MAX_IMAGE_SIZE_BYTES})`,
    );
  }
}

// Public endpoints — was src/upload/upload.controller.ts (@Controller('upload')).
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  uploadImage = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    assertImage(file);
    const url = await this.uploadService.uploadImage(file);
    res.status(201).json({ url });
  };

  uploadImages = async (req: Request, res: Response): Promise<void> => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new UnprocessableEntityException('File is required');
    }
    for (const file of files) {
      assertImage(file);
    }
    const urls = await this.uploadService.uploadImages(files);
    res.status(201).json({ urls });
  };
}
