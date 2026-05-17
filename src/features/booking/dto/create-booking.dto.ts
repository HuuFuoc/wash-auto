import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  staffShiftId: string;

  @ApiProperty({ example: '2026-06-01T09:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiPropertyOptional({
    example: 'Hút bụi kỹ phần ghế sau, xe bám lông chó.',
    maxLength: 500,
    description: 'Customer note for staff (special requests, parking info...)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
