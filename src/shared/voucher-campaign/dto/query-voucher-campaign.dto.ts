import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { VoucherSourceEnum } from '../../voucher/types/voucher-source.enum';
import { CampaignStatusEnum } from '../types/campaign-status.enum';

export class QueryVoucherCampaignDto {
  @ApiPropertyOptional({ enum: CampaignStatusEnum })
  @IsOptional()
  @IsEnum(CampaignStatusEnum)
  status?: CampaignStatusEnum;

  @ApiPropertyOptional({ enum: VoucherSourceEnum })
  @IsOptional()
  @IsEnum(VoucherSourceEnum)
  source?: VoucherSourceEnum;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
