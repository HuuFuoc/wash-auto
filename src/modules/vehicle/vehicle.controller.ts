import { Response } from 'express';
import { IdParam } from '../../common/params';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { VehicleService } from './vehicle.service';

// Customer endpoints — was features/vehicle/vehicle.controller.ts
// (@Controller('me/vehicles'), @UseGuards(JwtAuthGuard)). `req.user` is the
// access-token payload set by authMiddleware (= Nest's @CurrentUser()).
export class VehicleController {
  constructor(private readonly service: VehicleService) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.listOwn(req.user!.sub));
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getOwn(req.user!.sub, req.params.id));
  };

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    res
      .status(201)
      .json(await this.service.createOwn(req.user!.sub, req.body));
  };

  update = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(
      await this.service.updateOwn(req.user!.sub, req.params.id, req.body),
    );
  };

  setDefault = async (
    req: AuthRequest<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.setDefaultOwn(req.user!.sub, req.params.id));
  };

  // @Delete + @HttpCode(NO_CONTENT) → 204 with no body.
  remove = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    await this.service.softDeleteOwn(req.user!.sub, req.params.id);
    res.status(204).send();
  };
}
