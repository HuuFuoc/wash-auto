import { v2 as cloudinary } from 'cloudinary';
import { config } from '../../config';

// Configures the Cloudinary v2 SDK once at import time (replaces the Nest
// CloudinaryProvider useFactory). Reads the same env keys as before.
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

export type CloudinaryInstance = typeof cloudinary;
export { cloudinary };
