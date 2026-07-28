import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { CampaignStatusEnum } from '../types/campaign-status.enum';

/**
 * Campaign performance. Voucher counts are read from the vouchers themselves
 * and money from the redemption records — never from the cached counters, so a
 * drifted counter cannot make a report lie.
 */
export class CampaignStatsResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  campaignId: string;

  @ApiProperty({ example: 'tet-2026-winback' })
  name: string;

  @ApiProperty({ enum: CampaignStatusEnum })
  status: CampaignStatusEnum;

  @ApiProperty({ example: 1000, description: 'Vouchers ever minted.' })
  issued: number;

  @ApiProperty({
    example: 640,
    description:
      'Vouchers that reached a customer (claimed/reserved/used/expired).',
  })
  claimed: number;

  @ApiProperty({ example: 360, description: 'Still unclaimed in the pool.' })
  inPool: number;

  @ApiProperty({ example: 12, description: 'Held by an in-flight order.' })
  reserved: number;

  @ApiProperty({ example: 410 })
  used: number;

  @ApiProperty({ example: 218, description: 'Lapsed without being used.' })
  expired: number;

  @ApiProperty({
    example: 3,
    description: 'Killed by an admin. Not "expired".',
  })
  revoked: number;

  @ApiProperty({
    example: 64,
    description: 'used / claimed, as a percentage.',
  })
  redemptionRatePercent: number;

  @ApiProperty({
    example: 20500000,
    description: 'VND actually discounted by this campaign.',
  })
  totalDiscountVnd: number;

  @ApiPropertyOptional({ example: 50000000, description: 'Null = unbudgeted.' })
  budgetVnd?: number;

  @ApiProperty({ example: 20500000 })
  budgetUsedVnd: number;

  @ApiPropertyOptional({ example: 29500000 })
  budgetRemainingVnd?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'maxUsesTotal minus issued. Null when unlimited.',
  })
  usageLimitRemaining?: number;

  @ApiProperty({ example: 180000 })
  averageOrderBeforeDiscountVnd: number;

  @ApiProperty({ example: 130000 })
  averageOrderAfterDiscountVnd: number;

  @ApiProperty({
    example: 20500000,
    description:
      'The cached counter on the campaign, shown alongside the reconciled ' +
      'figure so drift is visible before it matters.',
  })
  cachedRedeemedVnd: number;

  @ApiProperty({
    example: true,
    description:
      'False means the cached counters disagree with the redemption records. ' +
      'Run the campaign-reconcile job to repair them.',
  })
  countersInSync: boolean;
}
