/*
 * One-off data migration for the "one car, one wash at a time" fix.
 *
 * `orders.active_slot_key` is new: it holds `<vehicle_id>@<scheduled_at ms>`
 * while an order is active and carries a unique index, so two concurrent
 * bookings of the same car into the same instant can no longer both succeed.
 * Orders written before the fix have no key, so the index does not cover them —
 * this backfills it.
 *
 * It also reports the double bookings the missing check already let through.
 * Those are NOT auto-cancelled: one of the two may be paid, checked in, or the
 * one the customer actually intends to keep, and only ops can say which. The
 * report gives them the order ids to resolve by hand.
 *
 * When two active orders share a vehicle AND an exact scheduled_at, only the
 * older one can take the key — the unique index is precisely what forbids the
 * second. The younger ones are listed under `keyWithheld` and become covered as
 * soon as the duplicate is resolved.
 *
 * Idempotent. Run once after deploying the fix:
 *   pnpm exec ts-node scripts/backfill-order-slot-keys.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import {
  OrderModel,
  buildActiveSlotKey,
} from '../src/modules/order/order.model';
import { ACTIVE_ORDER_STATUSES } from '../src/shared/order/types/order-status.enum';

interface Overlap {
  vehicleId: string;
  keptOrderId: string;
  keptAt: string;
  conflictingOrderId: string;
  conflictingAt: string;
  sameInstant: boolean;
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri);

  const active = await OrderModel.find({
    status: { $in: ACTIVE_ORDER_STATUSES },
  })
    .select({ _id: 1, vehicle_id: 1, scheduled_at: 1, estimated_minutes: 1 })
    .sort({ created_at: 1 })
    .lean();

  const byVehicle = new Map<string, typeof active>();
  for (const o of active) {
    const key = o.vehicle_id.toString();
    byVehicle.set(key, [...(byVehicle.get(key) ?? []), o]);
  }

  const overlaps: Overlap[] = [];
  let keysWritten = 0;
  let keyWithheld = 0;

  for (const [vehicleId, orders] of byVehicle) {
    // Oldest first (the sort above), so the booking that came in first is the
    // one that keeps the slot key and the later arrival is the reported dupe.
    const settled: typeof orders = [];
    for (const o of orders) {
      const startMs = o.scheduled_at.getTime();
      const durMs =
        (o.estimated_minutes > 0 ? o.estimated_minutes : 0) * 60_000;

      const clash = settled.find((s) => {
        const sStart = s.scheduled_at.getTime();
        const sDur =
          (s.estimated_minutes > 0 ? s.estimated_minutes : 0) * 60_000;
        return sStart < startMs + durMs && startMs < sStart + sDur;
      });

      if (clash) {
        const sameInstant = clash.scheduled_at.getTime() === startMs;
        overlaps.push({
          vehicleId,
          keptOrderId: clash._id.toString(),
          keptAt: clash.scheduled_at.toISOString(),
          conflictingOrderId: o._id.toString(),
          conflictingAt: o.scheduled_at.toISOString(),
          sameInstant,
        });
        // Only an exact-instant clash is what the unique index rejects; a
        // partial overlap can still hold its own (different) key.
        if (sameInstant) {
          keyWithheld++;
          continue;
        }
      }

      const r = await OrderModel.updateOne(
        { _id: o._id },
        {
          $set: {
            active_slot_key: buildActiveSlotKey(o.vehicle_id, o.scheduled_at),
          },
        },
      );
      keysWritten += r.modifiedCount ?? 0;
      settled.push(o);
    }
  }

  console.log(
    JSON.stringify(
      {
        activeOrders: active.length,
        vehicles: byVehicle.size,
        keysWritten,
        keyWithheld,
        doubleBookings: overlaps,
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
