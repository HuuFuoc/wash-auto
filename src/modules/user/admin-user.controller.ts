import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { QueryUserDto } from '../../features/user/dto/query-user.dto';
import { UserService } from './user.service';

// Admin endpoints — was features/user/admin-user.controller.ts
// (@Controller('admin/users'), guards at router level, ADMIN only).
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryUserDto;
    res.json(await this.userService.list(query));
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.userService.getOne(req.params.id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.userService.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.userService.update(req.params.id, req.body));
  };

  changeRole = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.userService.changeRole(req.params.id, req.body));
  };

  setStatus = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(
      await this.userService.setStatus(req.user!.sub, req.params.id, req.body),
    );
  };

  // @HttpCode(OK) → 200.
  resetPassword = async (
    req: Request<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.userService.resetPassword(req.params.id, req.body));
  };

  // @Delete + @HttpCode(NO_CONTENT) → 204.
  softDelete = async (
    req: AuthRequest<IdParam>,
    res: Response,
  ): Promise<void> => {
    await this.userService.softDelete(req.user!.sub, req.params.id);
    res.status(204).send();
  };
}
