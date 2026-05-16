import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { OrderStatus } from '../entities/order.entity';

export class QueryOrderDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  customerId?: string;
}
