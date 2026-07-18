import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Types } from 'mongoose';
import type { FeedbackDocument } from '../../../modules/feedback/feedback.model';

/** Resolves an id field that may be a raw ObjectId or a populated user sub-doc. */
function idAndName(value: unknown): { id: string; name?: string } {
  if (value && typeof value === 'object' && '_id' in value) {
    const v = value as { _id: Types.ObjectId; name?: string };
    return { id: v._id.toString(), name: v.name };
  }
  return { id: (value as Types.ObjectId | undefined)?.toString() ?? '' };
}

export class FeedbackResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  orderId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  workOrderId: string;

  @ApiPropertyOptional({ example: 'WO-240612-0001' })
  workOrderCode?: string;

  @ApiPropertyOptional({ example: '51K-123.45' })
  vehiclePlate?: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  customerName?: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  washerId: string;

  @ApiPropertyOptional({ example: 'Trần Văn B' })
  washerName?: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating: number;

  @ApiPropertyOptional({ example: 'Thợ rửa sạch, thái độ tốt.' })
  comment?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: FeedbackDocument): FeedbackResponseDto {
    const dto = new FeedbackResponseDto();
    dto.id = doc._id.toString();
    dto.orderId = doc.order_id.toString();
    const workOrder = doc.work_order_id as unknown;
    if (workOrder && typeof workOrder === 'object' && '_id' in workOrder) {
      const w = workOrder as {
        _id: Types.ObjectId;
        code?: string;
        vehicle_snapshot?: { plate?: string };
      };
      dto.workOrderId = w._id.toString();
      dto.workOrderCode = w.code;
      dto.vehiclePlate = w.vehicle_snapshot?.plate;
    } else {
      dto.workOrderId =
        (workOrder as Types.ObjectId | undefined)?.toString() ?? '';
    }
    const customer = idAndName(doc.customer_id);
    dto.customerId = customer.id;
    dto.customerName = customer.name;
    const washer = idAndName(doc.washer_id);
    dto.washerId = washer.id;
    dto.washerName = washer.name;
    dto.rating = doc.rating;
    dto.comment = doc.comment;
    const ts = doc as unknown as { created_at: Date; updated_at: Date };
    dto.createdAt = ts.created_at;
    dto.updatedAt = ts.updated_at;
    return dto;
  }
}

export class FeedbackEligibilityDto {
  @ApiProperty({
    example: true,
    description: 'Whether the order can be rated (completed and owned by you).',
  })
  eligible: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether a feedback already exists.',
  })
  alreadyRated: boolean;

  @ApiPropertyOptional({ type: FeedbackResponseDto, nullable: true })
  feedback: FeedbackResponseDto | null;
}

export class FeedbackListResponseDto {
  @ApiProperty({ type: FeedbackResponseDto, isArray: true })
  data: FeedbackResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class WasherFeedbackSummaryDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  washerId: string;

  @ApiProperty({
    example: 4.5,
    description: 'Mean rating, rounded to 1 decimal.',
  })
  averageRating: number;

  @ApiProperty({ example: 12, description: 'Total feedback received.' })
  count: number;

  @ApiProperty({
    example: { '1': 0, '2': 1, '3': 1, '4': 4, '5': 6 },
    description: 'Count per star value (1–5).',
  })
  distribution: Record<string, number>;
}
