import { Response } from 'express';
import { SendMessageDto } from '../../features/chat/dto/send-message.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { ChatService } from './chat.service';

// Public endpoints — was features/chat/chat.controller.ts (@Controller('chat'),
// OptionalJwtAuthGuard → optionalAuthMiddleware). Bearer token is optional.
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // @HttpCode(OK) → 200.
  sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    const dto = req.body as SendMessageDto;
    res.json(await this.chatService.sendMessage(dto, req.user?.sub));
  };

  getSession = async (
    req: AuthRequest<{ sessionId: string }>,
    res: Response,
  ): Promise<void> => {
    const { sessionId } = req.params;
    const messages = await this.chatService.getHistory(
      sessionId,
      req.user?.sub,
    );
    res.json({ sessionId, messages });
  };
}
