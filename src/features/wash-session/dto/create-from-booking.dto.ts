import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFromBookingDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  bookingId: string;

  @ApiPropertyOptional({ example: 'Khách yêu cầu hút bụi kỹ ghế sau' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
