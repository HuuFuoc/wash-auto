import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../shared/guards/optional-jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { ChatService } from './chat.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({
    summary: 'Gửi tin nhắn cho trợ lý AI',
    description:
      'Bearer token là tùy chọn. Nếu có, bot sẽ truy cập dữ liệu cá nhân ' +
      '(đơn, xe, khung giờ trống theo tier). Không có sessionId thì server ' +
      'tạo mới và trả về trong response.',
  })
  @ApiResponse({ status: 200, type: ChatResponseDto })
  @ApiResponse({ status: 429, description: 'Vượt giới hạn chat' })
  async sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: IAuthPayload | undefined,
  ): Promise<ChatResponseDto> {
    return this.chatService.sendMessage(dto, user?.sub);
  }

  @Get('sessions/:sessionId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy lịch sử hội thoại của một phiên chat' })
  @ApiResponse({ status: 200 })
  async getSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IAuthPayload | undefined,
  ): Promise<{ sessionId: string; messages: unknown[] }> {
    const messages = await this.chatService.getHistory(sessionId, user?.sub);
    return { sessionId, messages };
  }
}
