import { RequestHandler, Router } from 'express';
import multer, { memoryStorage, MulterError } from 'multer';
import { asyncHandler } from '../../common/async-handler';
import {
  BadRequestException,
  PayloadTooLargeException,
} from '../../common/exceptions';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

/** Maximum accepted upload size: 5 MB. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
/** Maximum number of images accepted in a single batch upload. */
const MAX_IMAGE_COUNT = 5;

// Manual DI wiring (replaces Nest's module providers).
const uploadService = new UploadService();
const controller = new UploadController(uploadService);
const upload = multer({
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
});

/**
 * Runs a Multer middleware and maps its limit errors to the same HTTP statuses
 * Nest's platform-express integration produced:
 *   LIMIT_FILE_SIZE → 413 Payload Too Large
 *   LIMIT_UNEXPECTED_FILE (too many files) → 400 Bad Request
 */
function runMulter(mw: RequestHandler): RequestHandler {
  return (req, res, next) => {
    mw(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new PayloadTooLargeException('File too large'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new BadRequestException('Unexpected field'));
        }
        return next(new BadRequestException(err.message));
      }
      if (err) return next(err as Error);
      next();
    });
  };
}

// Public router — mounted at /upload (no auth, matching the original).
export const uploadRouter = Router();
uploadRouter.post(
  '/image',
  runMulter(upload.single('file')),
  asyncHandler(controller.uploadImage),
);
uploadRouter.post(
  '/images',
  runMulter(upload.array('files', MAX_IMAGE_COUNT)),
  asyncHandler(controller.uploadImages),
);

