/*
 * Rebuilds the `users.phone` unique index as SPARSE, so Google accounts (which
 * have no phone number) can exist.
 *
 * Why a script and not just the schema change: MongoDB cannot alter an index's
 * options in place. `createIndex` with the same key pattern but different
 * options fails with IndexOptionsConflict, and Mongoose's autoIndex swallows
 * that into an 'index' event nobody listens to — so the app boots looking
 * healthy while the OLD non-sparse index is still enforcing the constraint.
 *
 * What goes wrong without it: a plain unique index stores a missing field as
 * null and indexes that null. The FIRST phone-less Google sign-up succeeds; the
 * SECOND one dies with `E11000 duplicate key: phone_1 dup key: { phone: null }`.
 * One user gets in, everyone after them is locked out — and the error names a
 * field the user never supplied, so it reads as a mystery.
 *
 * Guarantees:
 *   - Idempotent. Re-running when the index is already sparse is a no-op.
 *   - Only `phone` is touched, and only where it is explicitly `null` — that
 *     key is REMOVED (null and "absent" mean the same thing here, and sparse
 *     indexes skip only the absent form). No other field is modified.
 *   - Safe to run before deploying the new code (the old code never wrote a
 *     phone-less user, so a sparse index behaves identically for it).
 *
 * Run once, BEFORE or WITH the deploy that adds Google sign-in:
 *   pnpm exec ts-node scripts/migrate-google-auth.ts
 *
 * Dry run (reports what it would do, writes nothing):
 *   pnpm exec ts-node scripts/migrate-google-auth.ts --dry-run
 *
 * Rollback: only possible while every user still has a phone.
 *   db.users.dropIndex('phone_1');
 *   db.users.createIndex({ phone: 1 }, { unique: true });
 *
 * There is a brief window between the drop and the recreate during which two
 * concurrent writes could insert the same phone number. On a system this size
 * that is a fraction of a second; run it off-peak if that still bothers you.
 */
import mongoose from 'mongoose';
import { config } from '../src/config';

const PHONE_INDEX = 'phone_1';
const dryRun = process.argv.includes('--dry-run');

interface IIndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri, { dbName: config.database.name });
  const users = mongoose.connection.collection('users');
  console.log(
    `Connected to ${config.database.name}${dryRun ? ' (dry run)' : ''}`,
  );

  const indexes = (await users.indexes()) as unknown as IIndexInfo[];
  const phoneIndex = indexes.find((i) => i.name === PHONE_INDEX);

  if (!phoneIndex) {
    console.log(`No ${PHONE_INDEX} index found — creating it sparse + unique.`);
    if (!dryRun) {
      await users.createIndex({ phone: 1 }, { unique: true, sparse: true });
    }
  } else if (phoneIndex.sparse === true && phoneIndex.unique === true) {
    console.log(`${PHONE_INDEX} is already unique + sparse — nothing to do.`);
  } else {
    // A sparse index skips documents where the field is MISSING, but still
    // indexes one that is present and explicitly null — so two `phone: null`
    // rows would collide again even after the rebuild, and the dropIndex would
    // have left the collection with no uniqueness in between.
    //
    // `{ phone: null }` is NOT the query for this: in MongoDB that also matches
    // documents with no `phone` field at all, which are exactly the ones sparse
    // handles correctly. `$type: 'null'` matches only a present-and-null field.
    const explicitNulls = await users.countDocuments({
      phone: { $type: 'null' },
    });
    if (explicitNulls > 0) {
      // Unset rather than refuse: `phone: null` and "no phone key" mean the same
      // thing to this app, and leaving the nulls in place is what would break
      // the very constraint we are rebuilding.
      console.log(
        `Unsetting ${explicitNulls} explicit \`phone: null\` value(s) — sparse ` +
          `indexes skip MISSING fields, not null ones.`,
      );
      if (!dryRun) {
        await users.updateMany(
          { phone: { $type: 'null' } },
          { $unset: { phone: '' } },
        );
      }
    }

    console.log(
      `Rebuilding ${PHONE_INDEX} (unique=${String(phoneIndex.unique)} ` +
        `sparse=${String(phoneIndex.sparse)}) as unique + sparse.`,
    );
    if (!dryRun) {
      await users.dropIndex(PHONE_INDEX);
      await users.createIndex({ phone: 1 }, { unique: true, sparse: true });
    }
  }

  // New field, so this is a plain create — no conflict is possible.
  console.log('Ensuring google_id_1 (unique + sparse).');
  if (!dryRun) {
    await users.createIndex({ google_id: 1 }, { unique: true, sparse: true });
  }

  console.log(
    dryRun ? 'Dry run complete — nothing written.' : 'Migration complete.',
  );
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
