import { ApiPropertyOptional, PartialType } from '../../../common/swagger-shim';
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
