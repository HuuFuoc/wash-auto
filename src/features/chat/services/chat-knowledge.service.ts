import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatKnowledgeResponseDto } from '../dto/chat-knowledge-response.dto';
import { CreateChatKnowledgeDto } from '../dto/create-chat-knowledge.dto';
import { UpdateChatKnowledgeDto } from '../dto/update-chat-knowledge.dto';
import { ChatKnowledgeRepository } from '../repositories/chat-knowledge.repository';

const MAX_SEARCH_HITS = 5;

@Injectable()
export class ChatKnowledgeService {
  private readonly logger = new Logger(ChatKnowledgeService.name);

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
    this.logger.log(`FAQ created id=${doc._id.toString()}`);
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
    this.logger.log(`FAQ deleted id=${id}`);
  }

  /**
   * Used by the Gemini search_knowledge tool. Returns lightweight Q/A pairs
   * sorted by relevance.
   */
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
