import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { ServiceTypeModule } from '../service-type/service-type.module';
import { VehicleModule } from '../vehicle/vehicle.module';
import { AdminChatKnowledgeController } from './admin-chat-knowledge.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import {
  ChatKnowledge,
  ChatKnowledgeSchema,
} from './entities/chat-knowledge.entity';
import { ChatSession, ChatSessionSchema } from './entities/chat-session.entity';
import { ChatKnowledgeRepository } from './repositories/chat-knowledge.repository';
import { ChatSessionRepository } from './repositories/chat-session.repository';
import { ChatKnowledgeService } from './services/chat-knowledge.service';
import { ChatToolsService } from './services/chat-tools.service';
import { GeminiService } from './services/gemini.service';

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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: ChatKnowledge.name, schema: ChatKnowledgeSchema },
    ]),
    JwtModule.register({}),
    AuthModule,
    ServiceTypeModule,
    OrderModule,
    VehicleModule,
  ],
  controllers: [ChatController, AdminChatKnowledgeController],
  providers: [
    ChatService,
    ChatSessionRepository,
    ChatKnowledgeRepository,
    ChatKnowledgeService,
    ChatToolsService,
    GeminiService,
  ],
})
export class ChatModule implements OnModuleInit {
  private readonly logger = new Logger(ChatModule.name);

  constructor(private readonly knowledgeRepo: ChatKnowledgeRepository) {}

  async onModuleInit(): Promise<void> {
    const inserted = await this.knowledgeRepo.upsertByQuestion(SEED_FAQS);
    if (inserted > 0) {
      this.logger.log(`Seeded ${inserted} chat FAQ entries`);
    }
  }
}
