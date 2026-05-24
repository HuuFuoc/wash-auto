import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChatKnowledgeDto } from './create-chat-knowledge.dto';

export class UpdateChatKnowledgeDto extends PartialType(
  CreateChatKnowledgeDto,
) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
