import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  ValidateNested,
} from 'class-validator';

/** One (service, vehicle type) pair a washer is allowed to handle. */
export class WasherSkillDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f9' })
  @IsMongoId()
  vehicleTypeId: string;
}

/**
 * Body for `PUT /admin/users/:id/washer-skills`. Replaces the washer's full
 * skill list (set-semantics). An empty array clears all skills - that washer
 * will then never be auto-assigned any car.
 */
export class SetWasherSkillsDto {
  @ApiProperty({ type: [WasherSkillDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WasherSkillDto)
  skills: WasherSkillDto[];
}
