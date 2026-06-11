/* eslint-disable */
// Backfills ServiceType.vehicle_pricing so every active service has a price
// row for every active vehicle type, seeded from the service's existing
// base_price + estimated_minutes. Existing rows are left untouched, so this
// is safe to re-run.
//
// Run:  node scripts/seed-vehicle-pricing.js

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');

const uri = `mongodb+srv://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`;

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const vehicleTypes = await db
    .collection('vehicle_types')
    .find({ is_active: true })
    .toArray();
  if (vehicleTypes.length === 0) {
    console.error('No active vehicle types. Seed vehicle types first.');
    process.exit(1);
  }
  console.log(`Active vehicle types: ${vehicleTypes.map((v) => v.name).join(', ')}`);

  const services = await db.collection('service_types').find({}).toArray();
  let updatedServices = 0;
  let addedRows = 0;

  for (const svc of services) {
    const existing = svc.vehicle_pricing ?? [];
    const haveTypeIds = new Set(
      existing.map((p) => p.vehicle_type_id.toString()),
    );
    const newRows = [];
    for (const vt of vehicleTypes) {
      if (haveTypeIds.has(vt._id.toString())) continue; // keep existing row
      newRows.push({
        vehicle_type_id: vt._id,
        price: svc.base_price, // Decimal128, copied as-is
        estimated_minutes: svc.estimated_minutes,
        is_active: true,
      });
    }
    if (newRows.length === 0) continue;

    await db
      .collection('service_types')
      .updateOne(
        { _id: svc._id },
        { $push: { vehicle_pricing: { $each: newRows } }, $set: { updated_at: new Date() } },
      );
    updatedServices++;
    addedRows += newRows.length;
    console.log(`  ~ ${svc.name}: +${newRows.length} pricing row(s)`);
  }

  console.log(
    `\nDone. services updated=${updatedServices}, pricing rows added=${addedRows}`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
