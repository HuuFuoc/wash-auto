import mongoose from 'mongoose';
import { config } from './index';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.database.uri);
  // eslint-disable-next-line no-console
  console.log('✅ MongoDB connected');
}
