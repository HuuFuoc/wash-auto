import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import type { Router } from 'express';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';
import { authRouter } from '../modules/auth/auth.router';
import {
  adminChatKnowledgeRouter,
  chatRouter,
} from '../modules/chat/chat.router';
import { adminDashboardRouter } from '../modules/dashboard/dashboard.router';
import { adminGoldenHourRouter } from '../modules/golden-hour/golden-hour.router';
import { meLoyaltyRouter } from '../modules/loyalty/loyalty.router';
import {
  adminOrderRouter,
  meOrderRouter,
  paymentWebhookRouter,
  washerScheduleRouter,
} from '../modules/order/order.router';
import { adminPricingPolicyRouter } from '../modules/pricing-policy/pricing-policy.router';
import {
  adminServiceTypeRouter,
  serviceTypeRouter,
} from '../modules/service-type/service-type.router';
import {
  adminShiftRouter,
  shiftRouter,
} from '../modules/staff-shift/staff-shift.router';
import {
  adminTierConfigRouter,
  tierConfigRouter,
} from '../modules/tier-config/tier-config.router';
import { uploadRouter } from '../modules/upload/upload.router';
import { adminUserRouter } from '../modules/user/user.router';
import {
  adminVoucherRouter,
  meVoucherRouter,
} from '../modules/voucher/voucher.router';
import {
  adminVehicleRouter,
  meVehicleRouter,
} from '../modules/vehicle/vehicle.router';
import {
  adminVehicleTypeRouter,
  vehicleTypeRouter,
} from '../modules/vehicle-type/vehicle-type.router';
import {
  adminWorkOrderRouter,
  washerWorkOrderRouter,
} from '../modules/work-order/work-order.router';

// Mirrors the mount table in src/app.ts. Any route group added to the app
// without a matching OpenAPI path will fail this test.
const groups: Array<[Router, string]> = [
  [authRouter, '/auth'],
  [vehicleTypeRouter, '/vehicle-types'],
  [serviceTypeRouter, '/service-types'],
  [tierConfigRouter, '/tier-configs'],
  [uploadRouter, '/upload'],
  [paymentWebhookRouter, '/payments'],
  [chatRouter, '/chat'],
  [meVehicleRouter, '/me/vehicles'],
  [meVoucherRouter, '/me/vouchers'],
  [meLoyaltyRouter, '/me/loyalty'],
  [meOrderRouter, '/me/orders'],
  [washerWorkOrderRouter, '/me/work-orders'],
  [shiftRouter, '/shifts'],
  [washerScheduleRouter, '/washers/me'],
  [adminVehicleTypeRouter, '/admin/vehicle-types'],
  [adminServiceTypeRouter, '/admin/service-types'],
  [adminGoldenHourRouter, '/admin/golden-hours'],
  [adminPricingPolicyRouter, '/admin/pricing-policy'],
  [adminTierConfigRouter, '/admin/tier-configs'],
  [adminVehicleRouter, '/admin/vehicles'],
  [adminVoucherRouter, '/admin/vouchers'],
  [adminShiftRouter, '/admin/shifts'],
  [adminUserRouter, '/admin/users'],
  [adminOrderRouter, '/admin/orders'],
  [adminWorkOrderRouter, '/admin/work-orders'],
  [adminChatKnowledgeRouter, '/admin/chat-knowledge'],
  [adminDashboardRouter, '/admin/dashboard'],
];

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('OpenAPI coverage', () => {
  it.each(groups)('documents every route under %s', (router, prefix) => {
    assertRouterDocumented(router, prefix, spec.paths);
  });
});
