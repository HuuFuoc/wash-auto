import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { WorkOrderDocument } from '../entities/work-order.entity';
import { WorkOrderStatusEnum } from '../types/work-order-status.enum';

class VehicleSnapshotDto {
  @ApiProperty({ example: '51A-12345' })
  plate: string;

  @ApiProperty({ example: 'Motorbike' })
  vehicleTypeName: string;

  @ApiPropertyOptional({ example: 'Red' })
  color?: string;
}

class ChecklistItemDto {
  @ApiProperty({ example: 'Rửa thân xe' })
  label: string;

  @ApiProperty({ example: false })
  done: boolean;

  @ApiPropertyOptional({ example: '2026-05-22T09:15:00.000Z' })
  doneAt?: Date;
}

export class WorkOrderResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  orderId: string;

  @ApiProperty({ example: 'WO-20260522-001' })
  code: string;

  @ApiProperty({ type: VehicleSnapshotDto })
  vehicleSnapshot: VehicleSnapshotDto;

  @ApiProperty({ example: 'Standard Wash' })
  serviceName: string;

  @ApiProperty({ type: ChecklistItemDto, isArray: true })
  checklist: ChecklistItemDto[];

  @ApiProperty({
    type: [String],
    example: ['https://cdn.example.com/checkin/abc-front.jpg'],
    description: 'Vehicle photos the cashier captured at check-in.',
  })
  checkinPhotos: string[];

  @ApiProperty({
    enum: WorkOrderStatusEnum,
    example: WorkOrderStatusEnum.WAITING,
  })
  status: WorkOrderStatusEnum;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  assignedWasherId?: string;

  @ApiPropertyOptional({
    example: 'Trần Văn B',
    description:
      'Assigned washer name. Present only when the list populated it.',
  })
  assignedWasherName?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  assignedBy?: string;

  @ApiProperty({ example: 30 })
  estimatedMinutes: number;

  @ApiPropertyOptional({ example: 'Bay 1' })
  stationName?: string;

  @ApiPropertyOptional({ example: '2026-05-22T09:00:00.000Z' })
  startedAt?: Date;

  @ApiPropertyOptional({ example: '2026-05-22T09:25:00.000Z' })
  finishedAt?: Date;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  qcBy?: string;

  @ApiPropertyOptional({ example: '2026-05-22T09:30:00.000Z' })
  qcAt?: Date;

  @ApiPropertyOptional({ example: true })
  qcPassed?: boolean;

  @ApiPropertyOptional({ example: 'Còn vết nước ở kính sau.' })
  qcNote?: string;

  @ApiProperty({ example: 0 })
  returnCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: WorkOrderDocument): WorkOrderResponseDto {
    const dto = new WorkOrderResponseDto();
    dto.id = doc._id.toString();
    dto.orderId = doc.order_id.toString();
    dto.code = doc.code;
    dto.vehicleSnapshot = {
      plate: doc.vehicle_snapshot.plate,
      vehicleTypeName: doc.vehicle_snapshot.vehicle_type_name,
      color: doc.vehicle_snapshot.color,
    };
    dto.serviceName = doc.service_name;
    dto.checklist = doc.checklist.map((item) => ({
      label: item.label,
      done: item.done,
      doneAt: item.done_at,
    }));
    dto.checkinPhotos = doc.checkin_photos ?? [];
    dto.status = doc.status;
    // assigned_washer_id may be a raw ObjectId or a populated user sub-doc.
    const washer: unknown = doc.assigned_washer_id;
    if (washer && typeof washer === 'object' && '_id' in washer) {
      const w = washer as { _id: Types.ObjectId; name?: string };
      dto.assignedWasherId = w._id.toString();
      dto.assignedWasherName = w.name;
    } else {
      dto.assignedWasherId = doc.assigned_washer_id?.toString();
    }
    dto.assignedBy = doc.assigned_by?.toString();
    dto.estimatedMinutes = doc.estimated_minutes;
    dto.stationName = doc.station_name;
    dto.startedAt = doc.started_at;
    dto.finishedAt = doc.finished_at;
    dto.qcBy = doc.qc_by?.toString();
    dto.qcAt = doc.qc_at;
    dto.qcPassed = doc.qc_passed;
    dto.qcNote = doc.qc_note;
    dto.returnCount = doc.return_count;
    const ts = doc as unknown as { created_at: Date; updated_at: Date };
    dto.createdAt = ts.created_at;
    dto.updatedAt = ts.updated_at;
    return dto;
  }
}

export class WorkOrderListResponseDto {
  @ApiProperty({ type: WorkOrderResponseDto, isArray: true })
  data: WorkOrderResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
