import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  UploadApiErrorResponse,
  UploadApiOptions,
  UploadApiResponse,
} from 'cloudinary';
import { Readable } from 'node:stream';
import { CLOUDINARY, type CloudinaryInstance } from './cloudinary.config';

@Injectable()
export class UploadService {
  /** Cloudinary folder every uploaded image is stored under. */
  private static readonly UPLOAD_FOLDER = 'uploads';

  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: CloudinaryInstance,
  ) {}

  /**
   * Uploads an in-memory image buffer to Cloudinary and returns its URL.
   *
   * The file never touches disk: the buffer produced by Multer's memoryStorage
   * is streamed straight into Cloudinary's `upload_stream` API.
   *
   * @param file Image file provided by Multer (memoryStorage engine).
   * @returns The HTTPS `secure_url` of the stored image.
   * @throws InternalServerErrorException When Cloudinary rejects the upload or
   *   returns no result.
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
   *
   * Each file is streamed through {@link uploadImage}; the returned URLs preserve
   * the input order. If any single upload fails, the whole batch rejects.
   *
   * @param files Image files provided by Multer (memoryStorage engine).
   * @returns The HTTPS `secure_url` of every stored image, in input order.
   * @throws InternalServerErrorException When any Cloudinary upload fails.
   */
  uploadImages(files: Express.Multer.File[]): Promise<string[]> {
    return Promise.all(files.map((file) => this.uploadImage(file)));
  }
}
