import { ApiProperty } from '../../../common/swagger-shim';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/** Body for `POST /me/vouchers/claim` — a customer claims a pool voucher by code. */
export class ClaimVoucherDto {
  @ApiProperty({
    example: 'TET2026-20260620-0001',
    description: 'The voucher code to claim (case-insensitive).',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{3,40}$/, {
    message: 'Mã voucher chỉ gồm 3-40 ký tự A-Z, 0-9 hoặc dấu gạch ngang',
  })
  code: string;
}
