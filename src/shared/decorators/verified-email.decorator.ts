import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { IVerifiedEmailPayload } from '../types/verified-email-payload.type';

/**
 * Extracts the IVerifiedEmailPayload set by VerifiedEmailGuard.
 * Must only be used on routes guarded by VerifiedEmailGuard, otherwise
 * the value will be undefined.
 */
export const VerifiedEmail = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IVerifiedEmailPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as IVerifiedEmailPayload;
  },
);
