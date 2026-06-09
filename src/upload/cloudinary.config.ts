import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

/** DI token under which the configured Cloudinary v2 SDK is provided. */
export const CLOUDINARY = 'CLOUDINARY';

/** Type of the configured Cloudinary v2 SDK instance handed to consumers. */
export type CloudinaryInstance = typeof cloudinary;

/**
 * NestJS provider that configures the Cloudinary v2 SDK from environment
 * variables and exposes the ready-to-use instance under the {@link CLOUDINARY}
 * token. Reading config through {@link ConfigService.getOrThrow} guarantees the
 * app fails fast at startup if any credential is missing.
 */
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): CloudinaryInstance => {
    cloudinary.config({
      cloud_name: configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    return cloudinary;
  },
};
