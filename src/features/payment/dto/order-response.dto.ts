import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderDocument, OrderStatus } from '../entities/order.entity';

export class OrderResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  serviceTypeId: string;

  @ApiProperty({ example: 1716800000001 })
  orderCode: number;

  @ApiProperty({ example: 150000 })
  amount: number;

  @ApiProperty({ example: 'Rua xe 1716800000001' })
  description: string;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  status: OrderStatus;

  @ApiPropertyOptional({ example: 'https://pay.payos.vn/web/...' })
  checkoutUrl?: string;

  @ApiPropertyOptional({ example: 'Rua xe truoc tet' })
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: OrderDocument): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.vehicleId = doc.vehicle_id.toString();
    dto.serviceTypeId = doc.service_type_id.toString();
    dto.orderCode = doc.order_code;
    dto.amount = doc.amount;
    dto.description = doc.description;
    dto.status = doc.status;
    dto.checkoutUrl = doc.checkout_url;
    dto.notes = doc.notes;
    dto.createdAt = (doc as any).created_at;
    dto.updatedAt = (doc as any).updated_at;
    return dto;
  }
}

export class OrderListResponseDto {
  @ApiProperty({ type: OrderResponseDto, isArray: true })
  data: OrderResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
