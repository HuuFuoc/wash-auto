import { ConflictException, NotFoundException } from '../../common/exceptions';
import { ChatKnowledgeResponseDto } from '../../shared/chat/dto/chat-knowledge-response.dto';
import { CreateChatKnowledgeDto } from '../../shared/chat/dto/create-chat-knowledge.dto';
import { UpdateChatKnowledgeDto } from '../../shared/chat/dto/update-chat-knowledge.dto';
import { ChatKnowledgeRepository } from './chat-knowledge.repository';

const MAX_SEARCH_HITS = 5;

// Business logic copied verbatim from
// features/chat/services/chat-knowledge.service.ts; only DI + Nest exceptions +
// Logger were swapped out.
export class ChatKnowledgeService {
  constructor(private readonly repository: ChatKnowledgeRepository) {}

  async listAll(): Promise<ChatKnowledgeResponseDto[]> {
    const docs = await this.repository.findAll();
    return docs.map((d) => ChatKnowledgeResponseDto.fromDocument(d));
  }

  async getById(id: string): Promise<ChatKnowledgeResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('FAQ entry not found');
    return ChatKnowledgeResponseDto.fromDocument(doc);
  }

  async create(dto: CreateChatKnowledgeDto): Promise<ChatKnowledgeResponseDto> {
    if (await this.repository.existsByQuestion(dto.question)) {
      throw new ConflictException('Question already exists');
    }
    const doc = await this.repository.create({
      question: dto.question,
      answer: dto.answer,
      keywords: dto.keywords,
      category: dto.category,
    });
    console.log(`FAQ created id=${doc._id.toString()}`);
    return ChatKnowledgeResponseDto.fromDocument(doc);
  }

  async update(
    id: string,
    dto: UpdateChatKnowledgeDto,
  ): Promise<ChatKnowledgeResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('FAQ entry not found');
    if (dto.question && dto.question.trim() !== existing.question) {
      if (await this.repository.existsByQuestion(dto.question)) {
        throw new ConflictException('Question already exists');
      }
    }
    const doc = await this.repository.update(id, dto);
    if (!doc) throw new NotFoundException('FAQ entry not found');
    return ChatKnowledgeResponseDto.fromDocument(doc);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('FAQ entry not found');
    await this.repository.deleteById(id);
    console.log(`FAQ deleted id=${id}`);
  }

  /** Used by the Gemini search_knowledge tool. Lightweight Q/A pairs by relevance. */
  async searchForBot(
    query: string,
  ): Promise<{ question: string; answer: string; category?: string }[]> {
    const hits = await this.repository.search(query, MAX_SEARCH_HITS);
    return hits.map((h) => ({
      question: h.question,
      answer: h.answer,
      category: h.category,
    }));
  }
}
