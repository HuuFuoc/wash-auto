import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin revoke flips an UNUSED voucher to EXPIRED early. Used for fraud
 * suspicion, wrong-customer grant, or campaign rollback. A reason is
 * required so the audit log shows WHY the voucher was killed.
 */
export class RevokeVoucherDto {
  @ApiProperty({
    example: 'Granted to wrong customer by mistake',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
