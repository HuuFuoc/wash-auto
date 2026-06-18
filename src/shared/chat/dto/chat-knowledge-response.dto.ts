import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { ChatKnowledgeDocument } from '../../../modules/chat/chat-knowledge.model';

export class ChatKnowledgeResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'Cửa hàng mở cửa lúc mấy giờ?' })
  question: string;

  @ApiProperty({
    example: 'Wash-Auto mở cửa 07:00 - 21:00 mỗi ngày, kể cả cuối tuần.',
  })
  answer: string;

  @ApiProperty({
    type: [String],
    example: ['giờ mở cửa', 'opening hours'],
  })
  keywords: string[];

  @ApiPropertyOptional({ example: 'policy' })
  category?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: ChatKnowledgeDocument): ChatKnowledgeResponseDto {
    const dto = new ChatKnowledgeResponseDto();
    dto.id = doc._id.toString();
    dto.question = doc.question;
    dto.answer = doc.answer;
    dto.keywords = doc.keywords ?? [];
    dto.category = doc.category;
    dto.isActive = doc.is_active;
    const ts = doc as unknown as { created_at: Date; updated_at: Date };
    dto.createdAt = ts.created_at;
    dto.updatedAt = ts.updated_at;
    return dto;
  }
}
