import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Body for `POST /admin/golden-hours`. `endMinute` must be strictly greater
 * than `startMinute` - enforced in the service. Times are local to `timezone`.
 */
export class CreateGoldenHourDto {
  @ApiProperty({ example: 'Morning quiet hours' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5],
    default: [],
    description:
      'Days the window is active on (0=Sun … 6=Sat). Empty array = every day.',
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayUnique()
  daysOfWeek?: number[];

  @ApiProperty({
    example: 480,
    minimum: 0,
    maximum: 1439,
    description: 'Local start of the window, minutes since midnight (0..1439).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute: number;

  @ApiProperty({
    example: 600,
    minimum: 1,
    maximum: 1440,
    description:
      'Local end (exclusive), minutes since midnight (1..1440). ' +
      'Must be greater than startMinute.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute: number;

  @ApiPropertyOptional({
    example: 'Asia/Ho_Chi_Minh',
    default: 'Asia/Ho_Chi_Minh',
    description: 'IANA timezone the start/end minutes are expressed in.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;

  @ApiPropertyOptional({
    example: 10,
    default: 0,
    minimum: 0,
    maximum: 100,
    description:
      'Discount percent this window grants, stacked on top of the tier ' +
      'discount (total capped at 50% before vouchers). 0 = window only gates ' +
      'the tier discount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}
