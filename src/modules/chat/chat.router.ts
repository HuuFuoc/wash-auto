import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { CreateChatKnowledgeDto } from '../../features/chat/dto/create-chat-knowledge.dto';
import { SendMessageDto } from '../../features/chat/dto/send-message.dto';
import { UpdateChatKnowledgeDto } from '../../features/chat/dto/update-chat-knowledge.dto';
import {
  authMiddleware,
  optionalAuthMiddleware,
} from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { orderService } from '../order/order.router';
import { serviceTypeService } from '../service-type/service-type.router';
import { vehicleService } from '../vehicle/vehicle.router';
import { AdminChatKnowledgeController } from './admin-chat-knowledge.controller';
import { ChatController } from './chat.controller';
import { ChatKnowledgeRepository } from './chat-knowledge.repository';
import { ChatKnowledgeService } from './chat-knowledge.service';
import { ChatSessionRepository } from './chat-session.repository';
import { ChatService } from './chat.service';
import { ChatToolsService } from './chat-tools.service';
import { GeminiService } from './gemini.service';

// Manual DI wiring (reuses order/service-type/vehicle service instances).
const knowledgeRepo = new ChatKnowledgeRepository();
const sessionRepo = new ChatSessionRepository();
const knowledgeService = new ChatKnowledgeService(knowledgeRepo);
const toolsService = new ChatToolsService(
  serviceTypeService,
  orderService,
  vehicleService,
  knowledgeService,
);
const geminiService = new GeminiService(toolsService);
const chatService = new ChatService(sessionRepo, geminiService);
const chatController = new ChatController(chatService);
const adminController = new AdminChatKnowledgeController(knowledgeService);

// Public router — mounted at /chat. OptionalJwtAuth → optionalAuthMiddleware.
// NOTE: Nest's @Throttle (20/60s) + the global ThrottlerGuard are not ported
// (rate-limiting is a deferred cross-cutting concern — see MIGRATION_PROGRESS).
export const chatRouter = Router();
chatRouter.post(
  '/message',
  optionalAuthMiddleware,
  validateDto(SendMessageDto),
  asyncHandler(chatController.sendMessage),
);
chatRouter.get(
  '/sessions/:sessionId',
  optionalAuthMiddleware,
  asyncHandler(chatController.getSession),
);

// Admin router — mounted at /admin/chat-knowledge (ADMIN/MANAGER).
export const adminChatKnowledgeRouter = Router();
adminChatKnowledgeRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminChatKnowledgeRouter.get('/', asyncHandler(adminController.listAll));
adminChatKnowledgeRouter.get('/:id', asyncHandler(adminController.getOne));
adminChatKnowledgeRouter.post(
  '/',
  validateDto(CreateChatKnowledgeDto),
  asyncHandler(adminController.create),
);
adminChatKnowledgeRouter.patch(
  '/:id',
  validateDto(UpdateChatKnowledgeDto),
  asyncHandler(adminController.update),
);
adminChatKnowledgeRouter.delete('/:id', asyncHandler(adminController.remove));

// Replaces ChatModule.onModuleInit FAQ seed — called once from server bootstrap.
const SEED_FAQS = [
  {
    question: 'Wash-Auto mở cửa lúc mấy giờ?',
    answer:
      'Wash-Auto mở cửa từ 07:00 đến 21:00 tất cả các ngày trong tuần, kể cả lễ tết.',
    keywords: ['giờ mở cửa', 'giờ hoạt động', 'mở mấy giờ', 'opening hours'],
    category: 'info',
  },
  {
    question: 'Tiệm có rửa xe SUV và bán tải không?',
    answer:
      'Có ạ. Wash-Auto phục vụ đầy đủ loại xe: sedan, hatchback, SUV, MPV, bán tải. Mỗi loại xe có phụ phí kích thước được tính tự động khi đặt lịch.',
    keywords: ['SUV', 'bán tải', 'pickup', 'xe to', 'loại xe'],
    category: 'service',
  },
  {
    question: 'Tôi có thể đổi lịch hẹn không?',
    answer:
      'Anh/chị được đổi lịch tối đa 2 lần cho mỗi đơn, miễn phí, trước giờ hẹn ít nhất 30 phút. Thao tác trong mục "Đơn của tôi" → chọn đơn → Đổi lịch.',
    keywords: ['đổi lịch', 'reschedule', 'dời giờ', 'thay đổi lịch'],
    category: 'policy',
  },
  {
    question: 'Chính sách hủy đơn như thế nào?',
    answer:
      'Đơn cash được hủy miễn phí trước giờ hẹn. Đơn online: nếu chưa thanh toán, đơn tự huỷ sau 15 phút; nếu đã thanh toán, vui lòng liên hệ hotline để được hỗ trợ hoàn tiền.',
    keywords: ['huỷ đơn', 'cancel', 'hoàn tiền', 'refund'],
    category: 'policy',
  },
  {
    question: 'Có chương trình tích điểm không?',
    answer:
      'Có. Mỗi đơn rửa xe đều được tích điểm theo hệ số của gói dịch vụ (ví dụ Premium 1.5x). Điểm dùng để nâng hạng thành viên, mở thêm khung giờ ưu tiên và mở rộng số ngày đặt trước.',
    keywords: ['tích điểm', 'loyalty', 'thành viên', 'điểm thưởng', 'tier'],
    category: 'loyalty',
  },
  {
    question: 'Có thể thanh toán bằng cách nào?',
    answer:
      'Wash-Auto hỗ trợ 2 hình thức: thanh toán online qua PayOS (chuyển khoản, QR, thẻ) và thanh toán tiền mặt tại quầy lễ tân khi đến rửa xe.',
    keywords: ['thanh toán', 'payment', 'tiền mặt', 'cash', 'PayOS', 'QR'],
    category: 'payment',
  },
  {
    question: 'Một lần rửa xe mất bao lâu?',
    answer:
      'Thời gian phụ thuộc gói dịch vụ: Rửa cơ bản ~20 phút, Premium ~30 phút, Detailing ~90 phút. Mỗi gói đều có thời gian dự kiến hiển thị khi đặt lịch.',
    keywords: ['mất bao lâu', 'thời gian rửa', 'duration'],
    category: 'service',
  },
  {
    question: 'Tôi có cần đặt lịch trước không hay đến trực tiếp được?',
    answer:
      'Wave khuyến khích đặt lịch trước để giữ chỗ và rút ngắn thời gian chờ. Khách walk-in vẫn được phục vụ nếu còn slot trống tại thời điểm đến.',
    keywords: ['đặt lịch trước', 'walk-in', 'tới trực tiếp', 'không đặt'],
    category: 'booking',
  },
];

export async function seedChatKnowledge(): Promise<void> {
  const inserted = await knowledgeRepo.upsertByQuestion(SEED_FAQS);
  if (inserted > 0) {
    console.log(`Seeded ${inserted} chat FAQ entries`);
  }
}
