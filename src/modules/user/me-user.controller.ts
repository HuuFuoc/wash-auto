import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { UserService } from './user.service';

// Self-service profile endpoints — mounted at /me/profile, any authenticated
// role. All operations are keyed on the caller's own id (req.user.sub).
export class MeUserController {
  constructor(private readonly userService: UserService) {}

  getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.userService.getOne(req.user!.sub));
  };

  updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.userService.update(req.user!.sub, req.body));
  };

  changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.userService.changePassword(req.user!.sub, req.body));
  };
}
