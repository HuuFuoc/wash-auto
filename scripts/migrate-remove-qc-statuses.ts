/*
 * One-off data migration for the "remove manager QC" change.
 *
 * The work-order lifecycle no longer has `quality_check` / `returned` statuses
 * (a washer finishing now completes the order directly). Any work order left in
 * those legacy states must be moved to a valid status:
 *   - quality_check -> done   (+ complete the still in-progress order)
 *   - returned      -> in_progress (the washer was redoing the job)
 *
 * Run once after deploying the QC-removal change:
 *   pnpm exec ts-node scripts/migrate-remove-qc-statuses.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { OrderModel } from '../src/modules/order/order.model';
import { WorkOrderModel } from '../src/modules/work-order/work-order.model';
import { OrderStatusEnum } from '../src/shared/order/types/order-status.enum';
import { WorkOrderStatusEnum } from '../src/shared/work-order/types/work-order-status.enum';

// Status strings that no longer exist in WorkOrderStatusEnum (cast for queries).
const LEGACY_QC = 'quality_check';
const LEGACY_RETURNED = 'returned';

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri);

  const legacy = await WorkOrderModel.find({
    status: {
      $in: [LEGACY_QC, LEGACY_RETURNED] as unknown as WorkOrderStatusEnum[],
    },
  })
    .select({ _id: 1, order_id: 1, status: 1 })
    .lean();

  let qcToDone = 0;
  let ordersCompleted = 0;
  let returnedToInProgress = 0;

  for (const wo of legacy) {
    if ((wo.status as string) === LEGACY_QC) {
      await WorkOrderModel.updateOne(
        { _id: wo._id },
        { $set: { status: WorkOrderStatusEnum.DONE } },
      );
      const r = await OrderModel.updateOne(
        { _id: wo.order_id, status: OrderStatusEnum.IN_PROGRESS },
        { $set: { status: OrderStatusEnum.COMPLETED } },
      );
      ordersCompleted += r.modifiedCount ?? 0;
      qcToDone++;
    } else {
      await WorkOrderModel.updateOne(
        { _id: wo._id },
        { $set: { status: WorkOrderStatusEnum.IN_PROGRESS } },
      );
      returnedToInProgress++;
    }
  }

  console.log(
    JSON.stringify(
      {
        legacyWorkOrders: legacy.length,
        qcToDone,
        ordersCompleted,
        returnedToInProgress,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('migration failed:', e);
  await mongoose.disconnect();
  process.exit(1);
});
