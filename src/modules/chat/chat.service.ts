import { Content } from '@google/genai';
import { randomUUID } from 'crypto';
import { ChatResponseDto } from '../../shared/chat/dto/chat-response.dto';
import { SendMessageDto } from '../../shared/chat/dto/send-message.dto';
import { ChatSessionDocument, IChatMessage } from './chat-session.model';
import { ChatSessionRepository } from './chat-session.repository';
import { GeminiService } from './gemini.service';

const MAX_HISTORY_TURNS = 20;

// Business logic copied verbatim from features/chat/chat.service.ts;
// only DI + Logger were swapped out.
export class ChatService {
  constructor(
    private readonly sessionRepo: ChatSessionRepository,
    private readonly gemini: GeminiService,
  ) {}

  async sendMessage(
    dto: SendMessageDto,
    customerId?: string,
  ): Promise<ChatResponseDto> {
    const sessionId = dto.sessionId ?? randomUUID();
    const session = await this.loadOrCreateSession(sessionId, customerId);

    const history = this.toGeminiHistory(session.messages);
    const { text, toolsCalled } = await this.gemini.chat(history, dto.message, {
      customerId,
    });

    const now = new Date();
    const turns: IChatMessage[] = [
      { role: 'user', content: dto.message, created_at: now },
      { role: 'model', content: text, created_at: new Date(now.getTime() + 1) },
    ];
    await this.sessionRepo.appendMessages(sessionId, turns);

    console.log(
      `chat session=${sessionId} user=${customerId ?? 'guest'} tools=${toolsCalled.join(',') || '-'}`,
    );
    return { sessionId, reply: text, toolsCalled };
  }

  async getHistory(
    sessionId: string,
    customerId?: string,
  ): Promise<IChatMessage[]> {
    const session = await this.sessionRepo.findBySessionId(sessionId);
    if (!session) return [];
    // Owned sessions are not exposed to other users; guest sessions
    // (customer_id=null) are accessible to anyone holding the sessionId.
    if (
      session.customer_id &&
      (!customerId || session.customer_id.toString() !== customerId)
    ) {
      return [];
    }
    return session.messages;
  }

  // ---------- helpers ----------

  private async loadOrCreateSession(
    sessionId: string,
    customerId?: string,
  ): Promise<ChatSessionDocument> {
    const existing = await this.sessionRepo.findBySessionId(sessionId);
    if (existing) return existing;
    return this.sessionRepo.create({ sessionId, customerId });
  }

  private toGeminiHistory(messages: IChatMessage[]): Content[] {
    // Trim to the last N turns; Gemini bills per token.
    const recent = messages.slice(-MAX_HISTORY_TURNS * 2);
    return recent.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));
  }
}
