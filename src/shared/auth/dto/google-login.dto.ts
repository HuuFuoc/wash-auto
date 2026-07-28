import { ApiProperty } from '../../../common/swagger-shim';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body of POST /auth/google — the id_token an SPA already holds after using
 * Google Identity Services. Not an access token: only the id_token carries the
 * signed identity claims we verify.
 */
export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google id_token (JWT) obtained by the client from Google',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @IsNotEmpty()
  // A Google id_token is well under 4k; the cap just stops an unbounded body
  // from reaching the JWT parser.
  @MaxLength(4096)
  idToken: string;
}
