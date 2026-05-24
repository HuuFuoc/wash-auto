import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  FunctionCall,
  FunctionCallingConfigMode,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai';
import { ChatToolsService, IChatToolContext } from './chat-tools.service';

const MAX_TOOL_LOOP_ITERATIONS = 5;

export interface IGeminiReply {
  text: string;
  toolsCalled: string[];
}

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private client!: GoogleGenAI;
  private model!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: ChatToolsService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.getOrThrow<string>('gemini.apiKey');
    this.model = this.config.getOrThrow<string>('gemini.model');
    this.client = new GoogleGenAI({ apiKey });
    this.logger.log(`Gemini client ready (model=${this.model})`);
  }

  /**
   * Sends `history + userMessage` to Gemini and resolves function calls in
   * a loop until the model returns a final text answer.
   */
  async chat(
    history: Content[],
    userMessage: string,
    ctx: IChatToolContext,
  ): Promise<IGeminiReply> {
    const contents: Content[] = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const toolsCalled: string[] = [];
    let finalText = '';

    for (let iter = 0; iter < MAX_TOOL_LOOP_ITERATIONS; iter++) {
      const response: GenerateContentResponse = await this.generate(
        contents,
        ctx,
      );

      const calls: FunctionCall[] = response.functionCalls ?? [];
      const text = response.text ?? '';

      if (calls.length === 0) {
        finalText = text;
        break;
      }

      // Persist the model turn that contains the function call(s) so the
      // follow-up functionResponse has matching ids/order.
      const modelParts: Part[] = calls.map((call) => ({ functionCall: call }));
      contents.push({ role: 'model', parts: modelParts });

      const toolResultParts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? 'unknown';
        toolsCalled.push(name);
        const args = call.args ?? {};
        const result = await this.tools.execute(name, args, ctx);
        toolResultParts.push({
          functionResponse: {
            name,
            response: result.error
              ? { error: result.error }
              : { result: result.data },
          },
        });
      }
      contents.push({ role: 'user', parts: toolResultParts });
    }

    if (!finalText) {
      finalText =
        'Xin lỗi, hệ thống chưa thể trả lời ngay. Vui lòng thử lại sau ít phút.';
    }

    return { text: finalText, toolsCalled };
  }

  /**
   * Single Gemini call with one short retry on 429. If the quota is truly
   * zero (free-tier exhausted), we surface a 503 with a friendly message
   * instead of letting the raw ApiError bubble up as a 500.
   */
  private async generate(
    contents: Content[],
    ctx: IChatToolContext,
  ): Promise<GenerateContentResponse> {
    const params = {
      model: this.model,
      contents,
      config: {
        systemInstruction: this.buildSystemPrompt(ctx),
        tools: [{ functionDeclarations: this.tools.getDeclarations() }],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
        temperature: 0.4,
      },
    };
    try {
      return await this.client.models.generateContent(params);
    } catch (err) {
      const status = this.extractStatus(err);
      if (status === 429) {
        const delayMs = this.extractRetryDelayMs(err);
        if (delayMs > 0 && delayMs <= 5_000) {
          this.logger.warn(`Gemini 429 — retrying once after ${delayMs}ms`);
          await new Promise((r) => setTimeout(r, delayMs));
          try {
            return await this.client.models.generateContent(params);
          } catch (retryErr) {
            throw this.wrapQuotaError(retryErr);
          }
        }
        throw this.wrapQuotaError(err);
      }
      throw err;
    }
  }

  private extractStatus(err: unknown): number | undefined {
    if (err && typeof err === 'object' && 'status' in err) {
      const s = err.status;
      return typeof s === 'number' ? s : undefined;
    }
    return undefined;
  }

  private extractRetryDelayMs(err: unknown): number {
    const msg = err instanceof Error ? err.message : String(err);
    const m = /retryDelay"\s*:\s*"(\d+)s/.exec(msg);
    return m ? parseInt(m[1], 10) * 1000 : 0;
  }

  private wrapQuotaError(err: unknown): ServiceUnavailableException {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.error(`Gemini quota exhausted: ${msg}`);
    return new ServiceUnavailableException(
      'Trợ lý AI đang quá tải (vượt quota Gemini). Vui lòng thử lại sau ít phút.',
    );
  }

  private buildSystemPrompt(ctx: IChatToolContext): string {
    const authedNote = ctx.customerId
      ? `Khách đang đăng nhập với userId=${ctx.customerId}. Có thể dùng tool cá nhân (get_my_orders, list_my_vehicles, get_available_slots, get_order_detail).`
      : 'Khách chưa đăng nhập. Không dùng tool cá nhân; nếu khách hỏi đơn/lịch của họ, mời họ đăng nhập trước rồi quay lại chat.';

    return `Bạn là "Wave" — trợ lý ảo của Wash-Auto, trung tâm rửa xe tự động.

# Persona
- Tên: Wave. Xưng "mình" hoặc "Wave", gọi khách là "anh/chị".
- Tone: thân thiện, lịch sự, ngắn gọn (tối đa 4-5 câu mỗi lượt), không lan man.
- Luôn dùng tiếng Việt. Tránh dùng tiếng Anh trừ khi là tên riêng/thuật ngữ kỹ thuật.

# Phạm vi
- CHỈ trả lời các chủ đề: dịch vụ rửa xe, bảng giá, đặt lịch, đơn hàng của khách,
  loại xe, chính sách, thông tin cửa hàng Wash-Auto.
- Nếu khách hỏi ngoài phạm vi (chính trị, tin tức, code, học bài...), từ chối
  lịch sự và quay lại chủ đề rửa xe.
- Không bao giờ bịa số liệu (giá, giờ, mã đơn). Khi cần dữ liệu thật, GỌI TOOL.

# Quy tắc dùng tool
- list_services: khi khách hỏi "có dịch vụ gì", "bảng giá", "gói nào".
- get_my_orders / get_order_detail: khi khách hỏi về đơn của họ.
- get_available_slots: khi khách hỏi giờ trống. Phải biết serviceTypeId — nếu
  chưa biết, gọi list_services trước.
- list_my_vehicles: khi khách hỏi về xe đã đăng ký.
- get_business_info: khi khách hỏi giờ mở cửa, địa chỉ, hotline, chính sách
  chung (đổi lịch, hủy, hoàn tiền).
- search_knowledge: PHẢI gọi tool này TRƯỚC khi tự trả lời các câu hỏi không
  thuộc các nhóm trên (FAQ, ưu đãi, thắc mắc đặc thù). Nếu có hit, trích
  thông tin từ kết quả.

# Định dạng
- Tiền: "80.000đ", "1.200.000đ".
- Thời gian: hiển thị theo giờ Việt Nam (UTC+7) khi nói với khách, ví dụ
  "9h sáng mai".
- Danh sách dịch vụ/slot: gạch đầu dòng, tối đa 5 mục.

# Ví dụ
- Khách: "Cho mình xem bảng giá đi"
  Bot: [gọi list_services] → "Wash-Auto đang có 3 gói ạ:
  • Rửa cơ bản — 50.000đ (20 phút)
  • Rửa Premium — 80.000đ (30 phút)
  • Detailing — 200.000đ (90 phút)
  Anh/chị quan tâm gói nào để mình kiểm tra giờ trống giúp ạ?"

- Khách: "Mai 9h còn chỗ không?"
  Bot: [hỏi serviceTypeId hoặc gọi list_services + get_available_slots]

- Khách: "Tiệm mở mấy giờ?"
  Bot: [gọi get_business_info hoặc search_knowledge] → câu trả lời gọn.

- Khách: "Bạn nghĩ sao về thời sự hôm nay?"
  Bot: "Wave chỉ hỗ trợ về rửa xe thôi ạ. Anh/chị cần đặt lịch hay xem bảng giá không?"

# Khi không tìm thấy
Nếu tool báo không có dữ liệu hoặc khách hỏi điều bạn không chắc, trả lời
trung thực: "Mình chưa có thông tin này, anh/chị vui lòng gọi hotline 1900-xxxx
để được hỗ trợ trực tiếp ạ."

# Trạng thái phiên hiện tại
${authedNote}`;
  }
}
