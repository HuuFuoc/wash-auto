import {
  Controller,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';

/** Maximum accepted upload size: 5 MB. */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum number of images accepted in a single batch upload. */
const MAX_IMAGE_COUNT = 5;

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Uploads a single image (multipart/form-data, field name `file`) to
   * Cloudinary and returns its public URL.
   *
   * Validation is layered: Multer aborts oversized streams early (→ 413), while
   * the {@link ParseFilePipeBuilder} enforces the `image/*` mimetype, the 5 MB
   * cap, and file presence (→ 422).
   *
   * @param file Validated image file (≤ 5 MB, `image/*` mimetype).
   * @returns An object containing the uploaded image URL.
   */
  @Post('image')
  @ApiOperation({ summary: 'Upload a single image to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully',
    schema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'uri' } },
    },
  })
  @ApiResponse({ status: 413, description: 'File exceeds the 5 MB limit' })
  @ApiResponse({
    status: 422,
    description: 'Missing file or non-image mimetype',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  async uploadImage(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^image\//,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: true,
        }),
    )
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    const url = await this.uploadService.uploadImage(file);
    return { url };
  }

  /**
   * Uploads up to {@link MAX_IMAGE_COUNT} images (multipart/form-data, repeated
   * field name `files`) to Cloudinary and returns their public URLs.
   *
   * Validation is layered: Multer caps each file at 5 MB (→ 413) and rejects the
   * request if more than {@link MAX_IMAGE_COUNT} files are sent (→ 400), while
   * the {@link ParseFilePipeBuilder} enforces the `image/*` mimetype, the 5 MB
   * cap, and that at least one file is present (→ 422).
   *
   * @param files Validated image files (1–5 items, each ≤ 5 MB, `image/*`).
   * @returns An object containing the uploaded image URLs, in input order.
   */
  @Post('images')
  @ApiOperation({ summary: 'Upload up to 5 images to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          maxItems: MAX_IMAGE_COUNT,
        },
      },
      required: ['files'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Images uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: `More than ${MAX_IMAGE_COUNT} files were sent`,
  })
  @ApiResponse({ status: 413, description: 'A file exceeds the 5 MB limit' })
  @ApiResponse({
    status: 422,
    description: 'No files or a non-image mimetype',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGE_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  async uploadImages(
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /^image\//,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: true,
        }),
    )
    files: Express.Multer.File[],
  ): Promise<{ urls: string[] }> {
    const urls = await this.uploadService.uploadImages(files);
    return { urls };
  }
}
