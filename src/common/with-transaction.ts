import mongoose, { ClientSession } from 'mongoose';

/**
 * Runs `fn` inside a MongoDB transaction when the deployment supports one.
 *
 * Production is Atlas (a replica set), so transactions are available and the
 * multi-document redemption work — flipping the voucher, writing the redemption
 * record, bumping the campaign counters — commits or rolls back as one unit.
 *
 * Local/dev MongoDB is often a standalone server, where the driver rejects any
 * session-bound write. Rather than making every developer run a replica set,
 * we detect that specific failure once and fall back to running `fn` without a
 * session. The fallback is NOT silently unsafe: every write inside these
 * callbacks is an atomic compare-and-set that already fails closed on its own,
 * so losing atomicity across documents costs consistency of the audit trail,
 * not correctness of the voucher state.
 *
 * `fn` MUST forward the session to every repository call it makes; a write that
 * ignores it is simply outside the transaction.
 */
let transactionsSupported: boolean | null = null;

/** True for the "this server has no replica set" family of driver errors. */
function isUnsupportedTransactionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(
      msg,
    ) ||
    /Transactions are not supported/i.test(msg) ||
    /This MongoDB deployment does not support retryable writes/i.test(msg)
  );
}

export async function withTransaction<T>(
  fn: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  if (transactionsSupported === false) return fn(undefined);

  let session: ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session ?? undefined);
    });
    transactionsSupported = true;
    // withTransaction only resolves after the callback ran to completion.
    return result!;
  } catch (err) {
    if (!isUnsupportedTransactionError(err)) throw err;
    if (transactionsSupported === null) {
      console.warn(
        'MongoDB deployment does not support transactions - falling back to ' +
          'compare-and-set writes without cross-document atomicity',
      );
    }
    transactionsSupported = false;
    return fn(undefined);
  } finally {
    if (session) await session.endSession();
  }
}

/** Test seam: forget the cached capability probe. */
export function resetTransactionSupportCache(): void {
  transactionsSupported = null;
}
