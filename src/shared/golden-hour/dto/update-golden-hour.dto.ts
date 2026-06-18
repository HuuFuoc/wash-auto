import { ApiPropertyOptional, PartialType } from '../../../common/swagger-shim';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateGoldenHourDto } from './create-golden-hour.dto';

/**
 * Body for `PATCH /admin/golden-hours/:id`. Every field is optional; only the
 * provided fields are changed. Adds `isActive` to toggle the window on/off.
 */
export class UpdateGoldenHourDto extends PartialType(CreateGoldenHourDto) {
  @ApiPropertyOptional({
    example: true,
    description:
      'Activate or deactivate this window. Inactive windows are ignored when ' +
      'flagging golden-hour slots but kept for later reuse.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
