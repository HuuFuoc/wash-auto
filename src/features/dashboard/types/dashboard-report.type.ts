/**
 * Shape of the Management Reporting / Operational Analytics payload returned
 * by GET /admin/dashboard. Every figure is derived from real collections -
 * there is no mock/seed data. Empty windows return zeros and empty arrays so
 * the frontend can render honest "Chưa có dữ liệu" states.
 */

export interface RankRow {
  id: string;
  name: string;
  value: number;
  /** Optional secondary metric (e.g. revenue alongside a job count). */
  secondary?: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface NamedRevenue {
  name: string;
  revenue: number;
  orders: number;
}

export interface TimeBucket {
  /** ISO date (YYYY-MM-DD) for day buckets, YYYY-MM for month buckets. */
  key: string;
  revenue: number;
  orders: number;
}

export interface HourBucket {
  hour: number; // 0–23
  count: number;
}

export interface DashboardOverview {
  totalBookings: number;
  completedBookings: number;
  /** pending_payment + confirmed + checked_in + in_progress. */
  pendingBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  grossRevenue: number;
  discountAmount: number;
  refundAmount: number;
  netRevenue: number;
  totalCustomers: number;
  totalVehicles: number;
  activeWashers: number;
  usedVouchers: number;
  averageOrderValue: number;
}

export interface RevenueAnalytics {
  gross: number;
  discount: number;
  refund: number;
  net: number;
  averageOrderValue: number;
  byDay: TimeBucket[];
  byMonth: TimeBucket[];
  byService: NamedRevenue[];
  byVehicleType: NamedRevenue[];
  byPaymentMethod: NamedRevenue[];
}

export interface BookingAnalytics {
  statusSummary: Record<string, number>;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  byHour: HourBucket[];
  byService: NamedCount[];
  byVehicleType: NamedCount[];
  trendByDay: { key: string; count: number }[];
}

export interface WasherRow {
  id: string;
  name: string;
  completedJobs: number;
  assignedJobs: number;
  averageServiceMinutes: number;
  revenueHandled: number;
  /** QC rejections sent back to this washer - rework proxy (no ratings exist). */
  reworkCount: number;
  onTimeRate: number;
}

export interface CustomerAnalytics {
  topByVehicles: RankRow[];
  topByBookings: RankRow[];
  topBySpending: RankRow[];
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  tierDistribution: NamedCount[];
}

export interface VehicleAnalytics {
  total: number;
  byType: NamedCount[];
  revenueByType: NamedRevenue[];
  topType: string | null;
}

export interface VoucherLoyaltyAnalytics {
  totalIssued: number;
  used: number;
  unused: number;
  expired: number;
  redemptionRate: number;
  /** VND actually knocked off orders that redeemed a voucher (program cost). */
  voucherCost: number;
  topCustomersByVouchers: RankRow[];
  pointsBalanceTotal: number;
}

export interface ServiceAnalytics {
  mostUsed: NamedCount[];
  byRevenue: NamedRevenue[];
  averageDurationByService: { name: string; minutes: number }[];
}

export interface RefundDisputeAnalytics {
  refundCount: number;
  refundAmount: number;
  /** QC rejections - closest signal to a complaint/dispute in this system. */
  qcRejections: number;
  /** Completed orders in window (denominator for the rework rate). */
  completedBookings: number;
  reworkRate: number;
  disputesByWasher: RankRow[];
  /** Sections without a dedicated backing collection in the BE. */
  notes: string[];
}

export interface ScheduleAnalytics {
  totalShifts: number;
  totalCapacity: number;
  bookedSlots: number;
  availableSlots: number;
  utilizationRate: number;
  peakHours: HourBucket[];
}

/** One customer in a cancellation / no-show reliability ranking. */
export interface CustomerRiskRow {
  id: string;
  name: string;
  /** Masked phone (090****567). `null` when redacted for the manager scope. */
  phoneMasked: string | null;
  /** Customer's lifetime total orders (rate denominator). */
  totalBookings: number;
  /** Cancelled / no-show count within the selected window (rank metric). */
  count: number;
  /** Lifetime cancel/no-show rate = lifetimeCount / totalBookings * 100. */
  rate: number;
  /** ISO of the most recent cancel / no-show (updated_at fallback). */
  lastAt: string | null;
}

export interface CancellationNoShowAnalytics {
  totalCancelled: number;
  totalNoShow: number;
  cancellationRate: number;
  noShowRate: number;
  topCancellingCustomers: CustomerRiskRow[];
  topNoShowCustomers: CustomerRiskRow[];
  cancelledByService: NamedCount[];
  noShowByService: NamedCount[];
  cancelledByHour: HourBucket[];
  noShowByHour: HourBucket[];
  cancellationReasons: NamedCount[];
  trendByDay: { key: string; cancelled: number; noShow: number }[];
  notes: string[];
}

/**
 * `full` = admin (sees everything, including customer-identifying rankings).
 * `manager` = operational scope: customer-identifying detail is redacted
 * server-side (top customers by spending / vehicles / bookings / vouchers).
 */
export type DashboardScope = 'full' | 'manager';

export interface DashboardReport {
  scope: DashboardScope;
  range: { fromDate: string; toDate: string; period: string | null };
  overview: DashboardOverview;
  revenue: RevenueAnalytics;
  bookings: BookingAnalytics;
  washers: WasherRow[];
  customers: CustomerAnalytics;
  vehicles: VehicleAnalytics;
  voucherLoyalty: VoucherLoyaltyAnalytics;
  services: ServiceAnalytics;
  refundDispute: RefundDisputeAnalytics;
  cancellationNoShow: CancellationNoShowAnalytics;
  schedule: ScheduleAnalytics;
}
