import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { WorkOrderStatusEnum } from '../types/work-order-status.enum';

export class QueryWorkOrderDto {
  @ApiPropertyOptional({ enum: WorkOrderStatusEnum })
  @IsOptional()
  @IsEnum(WorkOrderStatusEnum)
  status?: WorkOrderStatusEnum;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Filter by the assigned washer.',
  })
  @IsOptional()
  @IsMongoId()
  washerId?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
