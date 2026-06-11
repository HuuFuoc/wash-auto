import { Injectable, Logger } from '@nestjs/common';
import { FunctionDeclaration, Type } from '@google/genai';
import { Types } from 'mongoose';
import { OrderService } from '../../order/services/order.service';
import { ServiceTypeService } from '../../service-type/service-type.service';
import { VehicleService } from '../../vehicle/vehicle.service';
import { ChatKnowledgeService } from './chat-knowledge.service';

/**
 * Context the bot has about the caller. `customerId` is undefined for
 * guest sessions - personalized tools refuse to run without it.
 */
export interface IChatToolContext {
  customerId?: string;
}

export interface IChatToolResult {
  /** Plain JSON the model can read back. Never throw - wrap errors here. */
  data: unknown;
  /** Human-friendly error message when something went wrong, else undefined. */
  error?: string;
}

@Injectable()
export class ChatToolsService {
  private readonly logger = new Logger(ChatToolsService.name);

  constructor(
    private readonly serviceTypeService: ServiceTypeService,
    private readonly orderService: OrderService,
    private readonly vehicleService: VehicleService,
    private readonly knowledgeService: ChatKnowledgeService,
  ) {}

  /**
   * Tool catalogue advertised to Gemini. Keep descriptions in Vietnamese -
   * the bot reasons in Vietnamese and chooses tools based on these.
   */
  getDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: 'list_services',
        description:
          'Liệt kê tất cả các gói dịch vụ rửa xe đang hoạt động kèm giá, ' +
          'thời gian dự kiến và hệ số tích điểm. Dùng khi khách hỏi về ' +
          'dịch vụ, bảng giá, gói rửa xe nào đang có.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_my_orders',
        description:
          'Lấy danh sách đơn rửa xe gần đây của khách đang đăng nhập (tối ' +
          'đa 10 đơn). Dùng khi khách hỏi "đơn của tôi", "lịch hẹn của tôi", ' +
          '"tôi đã đặt gì". Chỉ dùng được khi khách đã đăng nhập.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_order_detail',
        description:
          'Lấy chi tiết một đơn cụ thể của khách đang đăng nhập theo orderId. ' +
          'Trả về trạng thái, thời gian hẹn, dịch vụ, số tiền và phương thức ' +
          'thanh toán.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            orderId: {
              type: Type.STRING,
              description: 'MongoId của đơn rửa xe (24 ký tự hex).',
            },
          },
          required: ['orderId'],
        },
      },
      {
        name: 'list_my_vehicles',
        description:
          'Liệt kê các xe khách đã đăng ký trong gara của tài khoản. ' +
          'Chỉ dùng được khi khách đã đăng nhập.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'get_available_slots',
        description:
          'Tìm các khung giờ còn trống cho một dịch vụ trong một khoảng ' +
          'ngày. Trả về danh sách thời điểm có thể đặt (UTC) và sức chứa ' +
          'còn lại. Chỉ dùng được khi khách đã đăng nhập.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            serviceTypeId: {
              type: Type.STRING,
              description:
                'MongoId của dịch vụ. Nếu chưa có, gọi list_services trước.',
            },
            vehicleTypeId: {
              type: Type.STRING,
              description:
                'MongoId loại xe (giá/thời lượng theo loại xe). Tùy chọn — ' +
                'nếu bỏ trống sẽ dùng loại xe của xe đầu tiên trong gara khách.',
            },
            fromDate: {
              type: Type.STRING,
              description:
                'Ngày bắt đầu khoảng tìm (ISO 8601, ví dụ 2026-06-01T00:00:00.000Z).',
            },
            toDate: {
              type: Type.STRING,
              description:
                'Ngày kết thúc khoảng tìm (ISO 8601). Tối đa 31 ngày tính từ fromDate.',
            },
          },
          required: ['serviceTypeId', 'fromDate', 'toDate'],
        },
      },
      {
        name: 'get_business_info',
        description:
          'Lấy thông tin cửa hàng: giờ mở cửa, địa chỉ, hotline, chính sách. ' +
          'Dùng khi khách hỏi giờ mở cửa, liên hệ, hoàn tiền, đổi lịch.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'search_knowledge',
        description:
          'Tìm trong kho FAQ nội bộ của Wash-Auto những câu hỏi/đáp đã ' +
          'được admin biên soạn. Luôn gọi tool này TRƯỚC khi tự trả lời ' +
          'một câu khách hỏi chưa nằm trong phạm vi tool khác (chính sách, ' +
          'quy trình, ưu đãi, sản phẩm bán kèm, v.v.). Nếu có hit khớp, ' +
          'ưu tiên dùng nội dung đó.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description:
                'Từ khoá / câu hỏi tìm kiếm (tóm tắt ý khách bằng tiếng Việt).',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: IChatToolContext,
  ): Promise<IChatToolResult> {
    this.logger.log(
      `Tool call name=${name} customerId=${ctx.customerId ?? 'guest'}`,
    );
    try {
      switch (name) {
        case 'list_services':
          return await this.listServices();
        case 'get_my_orders':
          return await this.getMyOrders(ctx);
        case 'get_order_detail':
          return await this.getOrderDetail(args, ctx);
        case 'list_my_vehicles':
          return await this.listMyVehicles(ctx);
        case 'get_available_slots':
          return await this.getAvailableSlots(args, ctx);
        case 'get_business_info':
          return this.getBusinessInfo();
        case 'search_knowledge':
          return await this.searchKnowledge(args);
        default:
          return {
            data: null,
            error: `Tool "${name}" không tồn tại.`,
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool ${name} failed: ${msg}`);
      return { data: null, error: msg };
    }
  }

  // ---------- tool implementations ----------

  private async listServices(): Promise<IChatToolResult> {
    const services = await this.serviceTypeService.listActive();
    return {
      data: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        basePrice: s.basePrice,
        estimatedMinutes: s.estimatedMinutes,
        pointsMultiplier: s.pointsMultiplier,
      })),
    };
  }

  private async getMyOrders(ctx: IChatToolContext): Promise<IChatToolResult> {
    if (!ctx.customerId) {
      return {
        data: null,
        error: 'Khách chưa đăng nhập - không thể tra cứu đơn cá nhân.',
      };
    }
    const orders = await this.orderService.listOwn(ctx.customerId);
    return {
      data: orders.slice(0, 10).map((o) => ({
        id: o.id,
        status: o.status,
        scheduledAt: o.scheduledAt,
        amount: o.amount,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        serviceTypeId: o.serviceTypeId,
        payosCheckoutUrl: o.payosCheckoutUrl ?? null,
      })),
    };
  }

  private async getOrderDetail(
    args: Record<string, unknown>,
    ctx: IChatToolContext,
  ): Promise<IChatToolResult> {
    if (!ctx.customerId) {
      return {
        data: null,
        error: 'Khách chưa đăng nhập - không thể tra cứu đơn cá nhân.',
      };
    }
    const orderId = typeof args.orderId === 'string' ? args.orderId : '';
    if (!Types.ObjectId.isValid(orderId)) {
      return { data: null, error: 'orderId không hợp lệ.' };
    }
    const order = await this.orderService.getOwn(ctx.customerId, orderId);
    return {
      data: {
        id: order.id,
        status: order.status,
        scheduledAt: order.scheduledAt,
        amount: order.amount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        rescheduleCount: order.rescheduleCount,
        cancelReason: order.cancelReason ?? null,
        note: order.note ?? null,
        payosCheckoutUrl: order.payosCheckoutUrl ?? null,
      },
    };
  }

  private async listMyVehicles(
    ctx: IChatToolContext,
  ): Promise<IChatToolResult> {
    if (!ctx.customerId) {
      return {
        data: null,
        error: 'Khách chưa đăng nhập - không thể xem danh sách xe.',
      };
    }
    const vehicles = await this.vehicleService.listOwn(ctx.customerId);
    return { data: vehicles };
  }

  private async getAvailableSlots(
    args: Record<string, unknown>,
    ctx: IChatToolContext,
  ): Promise<IChatToolResult> {
    if (!ctx.customerId) {
      return {
        data: null,
        error:
          'Khách cần đăng nhập để xem khung giờ trống (tùy theo hạng thành viên).',
      };
    }
    const serviceTypeId =
      typeof args.serviceTypeId === 'string' ? args.serviceTypeId : '';
    const fromStr = typeof args.fromDate === 'string' ? args.fromDate : '';
    const toStr = typeof args.toDate === 'string' ? args.toDate : '';
    if (!Types.ObjectId.isValid(serviceTypeId)) {
      return { data: null, error: 'serviceTypeId không hợp lệ.' };
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { data: null, error: 'fromDate/toDate không hợp lệ.' };
    }
    // Price/duration vary by vehicle type, so slots need one. Prefer the
    // supplied id, else default to the customer's first saved vehicle's type.
    let vehicleTypeId =
      typeof args.vehicleTypeId === 'string' ? args.vehicleTypeId : '';
    if (!Types.ObjectId.isValid(vehicleTypeId)) {
      const vehicles = await this.vehicleService.listOwn(ctx.customerId);
      vehicleTypeId = vehicles[0]?.vehicleTypeId ?? '';
    }
    if (!Types.ObjectId.isValid(vehicleTypeId)) {
      return {
        data: null,
        error:
          'Chưa xác định được loại xe. Khách hãy thêm xe vào gara hoặc cho ' +
          'biết loại xe để ước tính khung giờ.',
      };
    }
    const slots = await this.orderService.listAvailableSlots(ctx.customerId, {
      serviceTypeId,
      vehicleTypeId,
      from,
      to,
    });
    return {
      data: slots.slice(0, 30).map((s) => ({
        scheduledAt: s.scheduledAt,
        remainingCapacity: s.remainingCapacity,
      })),
    };
  }

  private async searchKnowledge(
    args: Record<string, unknown>,
  ): Promise<IChatToolResult> {
    const query = typeof args.query === 'string' ? args.query : '';
    if (!query.trim()) {
      return { data: [], error: 'query rỗng.' };
    }
    const hits = await this.knowledgeService.searchForBot(query);
    return { data: hits };
  }

  private getBusinessInfo(): IChatToolResult {
    return {
      data: {
        name: 'Wash-Auto - Trung tâm rửa xe tự động',
        openingHours: '07:00 - 21:00 (Thứ Hai - Chủ Nhật)',
        hotline: '1900-xxxx',
        email: 'support@washauto.vn',
        policies: {
          reschedule: 'Cho phép đổi lịch tối đa 2 lần / đơn.',
          cancellation:
            'Hủy miễn phí trước giờ hẹn ít nhất 30 phút. Đơn quá giờ tự ' +
            'động chuyển NO_SHOW.',
          paymentTimeout:
            'Đơn thanh toán online sẽ tự huỷ nếu không thanh toán trong 15 phút.',
        },
      },
    };
  }
}
