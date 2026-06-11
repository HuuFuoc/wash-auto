/* eslint-disable */
// Seeds SCHEDULED staff shifts for the next 7 days, two shifts per day,
// aligned to the fixed working blocks (08:00–12:00 and 14:00–17:00 VN time)
// used by the booking engine. Each shift = one washer, concurrency 1
// (max_bookings=1). Uses any existing user with role washer/cashier; falls
// back to the first user in the DB if none exists.
//
// Run:  node scripts/seed-shift.js

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');

const VN_TZ_OFFSET_HOURS = 7;
const DAYS = 7;
const MAX_BOOKINGS = 1;

const uri = `mongodb+srv://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

/** Returns a Date at the given VN local hour for the given day-offset from today. */
function vnTimeUtc(dayOffset, hour) {
  const now = new Date();
  const todayVn = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour - VN_TZ_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
  todayVn.setUTCDate(todayVn.getUTCDate() + dayOffset);
  return todayVn;
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // Pick a staff user
  const staffRoles = await db
    .collection('roles')
    .find({ code: { $in: ['washer', 'cashier'] } })
    .toArray();
  const staffRoleIds = staffRoles.map((r) => r._id);

  let staff = await db
    .collection('users')
    .findOne({ role_id: { $in: staffRoleIds }, is_active: true });
  if (!staff) {
    staff = await db.collection('users').findOne({ is_active: true });
  }
  if (!staff) {
    console.error('No user in DB to attach the shift to. Register one first.');
    process.exit(1);
  }
  console.log(`Using staff_id=${staff._id.toString()} (${staff.email})`);

  let inserted = 0;
  let skipped = 0;

  for (let day = 0; day < DAYS; day++) {
    for (const block of [
      { start: 8, end: 12 },
      { start: 14, end: 17 },
    ]) {
      const startAt = vnTimeUtc(day, block.start);
      const endAt = vnTimeUtc(day, block.end);
      if (endAt.getTime() < Date.now() + 30 * 60 * 1000) {
        skipped++;
        continue; // shift already past or starts in <30min
      }

      // Idempotent: skip if a shift with same staff+start already exists
      const exists = await db.collection('staff_shifts').findOne({
        staff_id: staff._id,
        start_at: startAt,
      });
      if (exists) {
        skipped++;
        continue;
      }

      await db.collection('staff_shifts').insertOne({
        staff_id: staff._id,
        shift_type: 'washer',
        station_name: 'Bay 1',
        start_at: startAt,
        end_at: endAt,
        status: 'scheduled',
        max_bookings: MAX_BOOKINGS,
        current_bookings: 0,
        note: 'Auto-seeded by scripts/seed-shift.js',
        created_at: new Date(),
        updated_at: new Date(),
      });
      inserted++;
      console.log(
        `  + ${startAt.toISOString()} → ${endAt.toISOString()} (VN ${block.start}h-${block.end}h)`,
      );
    }
  }

  console.log(`\nDone. inserted=${inserted}, skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
