import { Types } from 'mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions';
import { RealtimeEvent, emitToManagers } from '../../core/realtime';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { notificationService } from '../notification/notification.router';
import { CreateFeedbackDto } from '../../shared/feedback/dto/create-feedback.dto';
import {
  FeedbackEligibilityDto,
  FeedbackListResponseDto,
  FeedbackResponseDto,
  WasherFeedbackSummaryDto,
} from '../../shared/feedback/dto/feedback-response.dto';
import { QueryFeedbackDto } from '../../shared/feedback/dto/query-feedback.dto';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import type { OrderDocument } from '../order/order.model';
import type { OrderRepository } from '../order/order.repository';
import type { WorkOrderRepository } from '../work-order/work-order.repository';
import { FeedbackRepository, IFeedbackListFilter } from './feedback.repository';

export class FeedbackService {
  constructor(
    private readonly repository: FeedbackRepository,
    private readonly orderRepository: OrderRepository,
    private readonly workOrderRepository: WorkOrderRepository,
  ) {}

  // ---------- CUSTOMER ----------

  /** Create or update the customer's rating for a completed order they own. */
  async submit(
    customerId: string,
    dto: CreateFeedbackDto,
  ): Promise<FeedbackResponseDto> {
    const order = await this.requireOrder(dto.orderId);
    if (order.customer_id.toString() !== customerId) {
      throw new ForbiddenException('You can only rate your own order');
    }
    if (order.status !== OrderStatusEnum.COMPLETED) {
      throw new BadRequestException(
        `Only completed orders can be rated (current status: ${order.status})`,
      );
    }
    const workOrder = await this.workOrderRepository.findByOrderId(order._id);
    if (!workOrder || !workOrder.assigned_washer_id) {
      throw new BadRequestException('No washer is recorded for this order');
    }

    const saved = await this.repository.upsertByOrder({
      orderId: order._id,
      workOrderId: workOrder._id,
      customerId: new Types.ObjectId(customerId),
      washerId: workOrder.assigned_washer_id,
      rating: dto.rating,
      comment: dto.comment,
    });
    const result = FeedbackResponseDto.fromDocument(saved);
    emitToManagers(RealtimeEvent.FEEDBACK_CREATED, result);
    void notificationService.notifyRoles([RoleEnum.MANAGER, RoleEnum.ADMIN], {
      type: NotificationTypeEnum.FEEDBACK_CREATED,
      title: 'Đánh giá mới từ khách',
      body: `Khách vừa đánh giá ${dto.rating}★ cho một đơn rửa xe.`,
      data: { orderId: order._id.toString(), rating: dto.rating },
    });
    return result;
  }

  /** Eligibility + the customer's own feedback (if any) for one order. */
  async getForOrder(
    customerId: string,
    orderId: string,
  ): Promise<FeedbackEligibilityDto> {
    const order = await this.orderRepository.findById(orderId);
    if (!order || order.customer_id.toString() !== customerId) {
      return { eligible: false, alreadyRated: false, feedback: null };
    }
    const existing = await this.repository.findByOrderId(order._id);
    return {
      eligible: order.status === OrderStatusEnum.COMPLETED,
      alreadyRated: existing !== null,
      feedback: existing ? FeedbackResponseDto.fromDocument(existing) : null,
    };
  }

  async listForCustomer(
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<FeedbackListResponseDto> {
    const [docs, total] = await Promise.all([
      this.repository.findByCustomer(customerId, page, limit),
      this.repository.countByCustomer(customerId),
    ]);
    return this.toListResponse(docs, page, limit, total);
  }

  // ---------- MANAGER / ADMIN ----------

  async adminList(query: QueryFeedbackDto): Promise<FeedbackListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IFeedbackListFilter = {};
    if (query.washerId) filter.washerId = new Types.ObjectId(query.washerId);
    if (query.orderId) filter.orderId = new Types.ObjectId(query.orderId);

    const [docs, total] = await Promise.all([
      this.repository.findPaginated(filter, page, limit),
      this.repository.countMatching(filter),
    ]);
    return this.toListResponse(docs, page, limit, total);
  }

  async washerSummary(washerId: string): Promise<WasherFeedbackSummaryDto> {
    const summary = await this.repository.summaryByWasher(washerId);
    return { washerId, ...summary };
  }

  // ---------- helpers ----------

  private async requireOrder(id: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private toListResponse(
    docs: Parameters<typeof FeedbackResponseDto.fromDocument>[0][],
    page: number,
    limit: number,
    total: number,
  ): FeedbackListResponseDto {
    return {
      data: docs.map((d) => FeedbackResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
