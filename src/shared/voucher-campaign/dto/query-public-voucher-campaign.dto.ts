import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CampaignStatusEnum } from '../types/campaign-status.enum';

/**
 * Statuses a customer is allowed to browse. DRAFT is absent on purpose: an
 * unannounced promotion must not be discoverable, and `GET /voucher-campaigns/:id`
 * already 404s it.
 */
export const BROWSABLE_CAMPAIGN_STATUSES: CampaignStatusEnum[] = [
  CampaignStatusEnum.ACTIVE,
  CampaignStatusEnum.SCHEDULED,
  CampaignStatusEnum.PAUSED,
  CampaignStatusEnum.ENDED,
];

/** Query for the public `GET /voucher-campaigns` promotions list. */
export class QueryPublicVoucherCampaignDto {
  @ApiPropertyOptional({
    enum: BROWSABLE_CAMPAIGN_STATUSES,
    default: CampaignStatusEnum.ACTIVE,
    description:
      'Defaults to active — the promotions running right now. `draft` is ' +
      'rejected with 400.',
  })
  @IsOptional()
  @IsIn(BROWSABLE_CAMPAIGN_STATUSES, {
    message: `status phải là một trong: ${BROWSABLE_CAMPAIGN_STATUSES.join(', ')}`,
  })
  status?: CampaignStatusEnum;

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
