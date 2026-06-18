import { ApiProperty } from '../../../common/swagger-shim';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class OtpSendDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;
}
