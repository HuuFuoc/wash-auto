import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { IAuthPayload } from '../types/auth-payload.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IAuthPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as IAuthPayload;
  },
);
