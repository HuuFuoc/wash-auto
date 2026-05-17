import {
  BadRequestException,
  ExecutionContext,
  createParamDecorator,
} from '@nestjs/common';
import { Request } from 'express';

const HEADER = 'idempotency-key';
const PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

/**
 * Reads the Idempotency-Key header. Returns undefined when absent and
 * throws 400 on malformed values so clients fix their tooling instead
 * of silently re-charging customers.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const raw = req.headers[HEADER];
    if (raw === undefined || raw === '') return undefined;
    if (Array.isArray(raw)) {
      throw new BadRequestException('Idempotency-Key must be a single value');
    }
    if (!PATTERN.test(raw)) {
      throw new BadRequestException('Idempotency-Key has invalid format');
    }
    return raw;
  },
);
