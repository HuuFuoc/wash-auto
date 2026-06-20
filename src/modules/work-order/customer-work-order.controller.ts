import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { WorkOrderService } from './work-order.service';

interface OrderIdParam {
  orderId: string;
}

// Customer endpoint — mounted at /me/orders (CUSTOMER). Lets a customer see who
// is/was washing their car for one of their orders.
export class CustomerWorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  getByOrder = async (
    req: AuthRequest<OrderIdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(
      await this.service.getForCustomerByOrder(
        req.user!.sub,
        req.params.orderId,
      ),
    );
  };
}
