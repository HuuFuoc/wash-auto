import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class QcWorkOrderDto {
  @ApiProperty({
    example: true,
    description: 'true → work order DONE. false → RETURNED to the washer.',
  })
  @IsBoolean()
  passed: boolean;

  @ApiPropertyOptional({
    example: 'Còn vết nước ở kính sau, làm lại.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
