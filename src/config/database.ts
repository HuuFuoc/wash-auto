import mongoose from 'mongoose';
import { config } from './index';

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.database.uri);

  console.log('✅ MongoDB connected');
}
