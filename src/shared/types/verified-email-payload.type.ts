import { JwtScope } from './jwt-scope.enum';

export interface IVerifiedEmailPayload {
  /** Mongo user _id as string. */
  sub: string;
  email: string;
  scope: JwtScope.EMAIL_VERIFIED;
  iat?: number;
  exp?: number;
}
