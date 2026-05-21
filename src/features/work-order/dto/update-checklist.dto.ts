import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Min } from 'class-validator';

/** Body for ticking a single checklist item on a work order. */
export class UpdateChecklistDto {
  @ApiProperty({ example: 0, description: 'Zero-based index of the item.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  index: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  done: boolean;
}
