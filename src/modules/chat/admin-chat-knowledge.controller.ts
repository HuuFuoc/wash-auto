import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { ChatKnowledgeService } from './chat-knowledge.service';

// Admin endpoints — was features/chat/admin-chat-knowledge.controller.ts
// (@Controller('admin/chat-knowledge'), guards at router level, ADMIN/MANAGER).
export class AdminChatKnowledgeController {
  constructor(private readonly service: ChatKnowledgeService) {}

  listAll = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listAll());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  // @Delete + @HttpCode(NO_CONTENT) → 204.
  remove = async (req: Request<IdParam>, res: Response): Promise<void> => {
    await this.service.remove(req.params.id);
    res.status(204).send();
  };
}
