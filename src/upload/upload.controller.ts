import {
  Controller,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
}
