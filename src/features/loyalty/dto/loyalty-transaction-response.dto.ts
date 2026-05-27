import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoyaltyTransactionDocument } from '../entities/loyalty-transaction.entity';
import { LoyaltyTransactionTypeEnum } from '../types/loyalty-transaction-type.enum';

export class LoyaltyTransactionResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({
    enum: LoyaltyTransactionTypeEnum,
    example: LoyaltyTransactionTypeEnum.EARN_COMPLETED,
  })
  type: LoyaltyTransactionTypeEnum;

  @ApiProperty({ example: 150 })
  pointsDelta: number;

  @ApiProperty({ example: 350 })
  balanceAfter: number;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  orderId?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  voucherId?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  previousTierConfigId?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  newTierConfigId?: string;

  @ApiPropertyOptional({ example: 'Earned from order 6601...' })
  reason?: string;

  @ApiProperty()
  createdAt: Date;

  static fromDocument(
    doc: LoyaltyTransactionDocument,
  ): LoyaltyTransactionResponseDto {
    const dto = new LoyaltyTransactionResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.type = doc.type;
    dto.pointsDelta = doc.points_delta;
    dto.balanceAfter = doc.balance_after;
    dto.orderId = doc.order_id?.toString();
    dto.voucherId = doc.voucher_id?.toString();
    dto.previousTierConfigId = doc.previous_tier_config_id?.toString();
    dto.newTierConfigId = doc.new_tier_config_id?.toString();
    dto.reason = doc.reason;
    const ts = doc as unknown as { created_at: Date };
    dto.createdAt = ts.created_at;
    return dto;
  }
}

export class LoyaltyTransactionListResponseDto {
  @ApiProperty({ type: LoyaltyTransactionResponseDto, isArray: true })
  data: LoyaltyTransactionResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
