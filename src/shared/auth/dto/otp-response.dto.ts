import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';

export class OtpSendResponseDto {
  @ApiProperty({ example: 'OTP sent if account exists' })
  message: string;

  /** Present only when verification was skipped (already verified within window). */
  @ApiPropertyOptional({ example: 'eyJhbGciOi...' })
  token?: string;
}

export class OtpVerifyResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOi...',
    description: 'JWT scope=email_verified, 15m TTL',
  })
  token: string;
}
