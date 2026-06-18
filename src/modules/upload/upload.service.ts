import {
  UploadApiErrorResponse,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'node:stream';
import { InternalServerErrorException } from '../../common/exceptions';
import {
  cloudinary as defaultCloudinary,
  CloudinaryInstance,
} from './cloudinary';

// Business logic copied verbatim from features upload.service.ts; the
// @Inject(CLOUDINARY) dependency is now a constructor default.
export class UploadService {
  /** Cloudinary folder every uploaded image is stored under. */
  private static readonly UPLOAD_FOLDER = 'uploads';

  constructor(
    private readonly cloudinary: CloudinaryInstance = defaultCloudinary,
  ) {}

  /**
   * Uploads an in-memory image buffer to Cloudinary and returns its URL.
   * The file never touches disk: the buffer produced by Multer's memoryStorage
   * is streamed straight into Cloudinary's `upload_stream` API.
   */
  uploadImage(file: Express.Multer.File): Promise<string> {
    const options: UploadApiOptions = {
      folder: UploadService.UPLOAD_FOLDER,
      resource_type: 'image',
    };

    return new Promise<string>((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        options,
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            reject(new InternalServerErrorException(error.message));
            return;
          }
          if (!result) {
            reject(
              new InternalServerErrorException(
                'Cloudinary returned no result for the upload',
              ),
            );
            return;
          }
          resolve(result.secure_url);
        },
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Uploads several in-memory image buffers to Cloudinary in parallel.
   * The returned URLs preserve the input order; if any single upload fails,
   * the whole batch rejects.
   */
  uploadImages(files: Express.Multer.File[]): Promise<string[]> {
    return Promise.all(files.map((file) => this.uploadImage(file)));
  }
}
