import { registerAs } from '@nestjs/config';

export default registerAs('gemini', () => ({
  apiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  model: (process.env.GEMINI_MODEL ?? 'gemini-2.0-flash').trim(),
}));
