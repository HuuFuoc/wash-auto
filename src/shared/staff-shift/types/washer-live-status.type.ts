import { WorkOrderStatusEnum } from '../../work-order/types/work-order-status.enum';

/** The wash ticket a washer is currently occupied with. */
export interface WasherCurrentWorkOrder {
  id: string;
  code: string;
  plate: string;
  vehicleTypeName: string;
  serviceName: string;
  /** ASSIGNED (accepted, not started) or IN_PROGRESS (washing now). */
  status: WorkOrderStatusEnum;
  /** Set once the washer presses start; null while still ASSIGNED. */
  startedAt: Date | null;
  estimatedMinutes: number;
  stationName?: string;
}

/** One washer's live state for the monitoring board. */
export interface WasherLiveStatusRow {
  washerId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  /** Has a live (SCHEDULED/ACTIVE) washer shift covering `now`. */
  onShift: boolean;
  status: 'free' | 'assigned' | 'in_progress';
  currentWorkOrder: WasherCurrentWorkOrder | null;
}
