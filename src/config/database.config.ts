import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  const username = encodeURIComponent(process.env.DB_USERNAME ?? '');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const host = process.env.DB_HOST ?? '';
  const name = process.env.DB_NAME ?? '';

  return {
    uri: `mongodb+srv://${username}:${password}@${host}/${name}?retryWrites=true&w=majority`,
    name,
  };
});
