/**
 * Replacement for Nest's HttpException. Carries an HTTP status, a response
 * payload (`string` for a single message, or `string[]` for class-validator
 * error lists), and an optional `error` reason phrase. The error middleware
 * renders these into Nest's default body shape: `{ statusCode, message, error }`
 * (where `message` may be a string or an array — exactly like ValidationPipe).
 */
export class HttpException extends Error {
  constructor(
    public readonly status: number,
    public readonly response: string | string[],
    public readonly error?: string,
  ) {
    super(Array.isArray(response) ? response.join(', ') : response);
    this.name = 'HttpException';
  }
}
