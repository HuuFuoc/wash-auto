import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { ChatKnowledgeResponseDto } from './dto/chat-knowledge-response.dto';
import { CreateChatKnowledgeDto } from './dto/create-chat-knowledge.dto';
import { UpdateChatKnowledgeDto } from './dto/update-chat-knowledge.dto';
import { ChatKnowledgeService } from './services/chat-knowledge.service';

@ApiTags('admin · chat-knowledge')
@ApiBearerAuth()
@Controller('admin/chat-knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
export class AdminChatKnowledgeController {
  constructor(private readonly service: ChatKnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'List all FAQ entries (incl. inactive)' })
  @ApiResponse({ status: 200, type: ChatKnowledgeResponseDto, isArray: true })
  listAll(): Promise<ChatKnowledgeResponseDto[]> {
    return this.service.listAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single FAQ entry' })
  @ApiResponse({ status: 200, type: ChatKnowledgeResponseDto })
  @ApiResponse({ status: 404, description: 'FAQ entry not found' })
  getOne(@Param('id') id: string): Promise<ChatKnowledgeResponseDto> {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new FAQ entry' })
  @ApiResponse({ status: 201, type: ChatKnowledgeResponseDto })
  @ApiResponse({ status: 409, description: 'Question already exists' })
  create(
    @Body() dto: CreateChatKnowledgeDto,
  ): Promise<ChatKnowledgeResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an FAQ entry' })
  @ApiResponse({ status: 200, type: ChatKnowledgeResponseDto })
  @ApiResponse({ status: 404, description: 'FAQ entry not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChatKnowledgeDto,
  ): Promise<ChatKnowledgeResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an FAQ entry' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'FAQ entry not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
