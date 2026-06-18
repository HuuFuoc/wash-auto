import { PipelineStage, Types } from 'mongoose';
import { BadRequestException } from '../../common/exceptions';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { QueryDashboardDto } from '../../shared/dashboard/dto/query-dashboard.dto';
import {
  CustomerRiskRow,
  DashboardReport,
  HourBucket,
  NamedCount,
  NamedRevenue,
  RankRow,
} from '../../shared/dashboard/types/dashboard-report.type';
import { RoleModel } from '../auth/role.model';
import { UserModel } from '../auth/user.model';
import { LoyaltyAccountModel } from '../loyalty/loyalty-account.model';
import { OrderModel } from '../order/order.model';
import { StaffShiftModel } from '../staff-shift/staff-shift.model';
import { VehicleModel } from '../vehicle/vehicle.model';
import { VoucherModel } from '../voucher/voucher.model';
import { WorkOrderModel } from '../work-order/work-order.model';

const TZ = 'Asia/Ho_Chi_Minh';

/** Loose row shapes coming out of MongoDB aggregations. */
type CountRow = { _id: string | null; c: number };
type RevenueRow = { _id: string | null; revenue: number; orders: number };
type RankAggRow = {
  id: string;
  name: string;
  value: number;
  secondary?: number;
};

/**
 * Management Reporting / Operational Analytics service.
 *
 * Copied verbatim from features/dashboard/dashboard.service.ts; only DI
 * (@InjectModel) was replaced with direct model references + Nest exceptions.
 * Every figure is aggregated live from the real collections. Revenue is
 * recognised ONLY on orders that are both `completed` AND `paid`.
 */
export class DashboardService {
  private readonly orderModel = OrderModel;
  private readonly vehicleModel = VehicleModel;
  private readonly voucherModel = VoucherModel;
  private readonly workOrderModel = WorkOrderModel;
  private readonly userModel = UserModel;
  private readonly roleModel = RoleModel;
  private readonly loyaltyModel = LoyaltyAccountModel;
  private readonly shiftModel = StaffShiftModel;

  async getReport(
    query: QueryDashboardDto,
    role: RoleEnum,
  ): Promise<DashboardReport> {
    const from = query.fromDate ? vnDayStart(query.fromDate) : new Date(0);
    const to = query.toDate ? vnDayEnd(query.toDate) : new Date();
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('fromDate không được lớn hơn toDate');
    }
    const period = query.period ?? null;
    const topN = query.topN ?? 5;
    const serviceId =
      query.serviceId && Types.ObjectId.isValid(query.serviceId)
        ? new Types.ObjectId(query.serviceId)
        : undefined;

    const [
      orderFacet,
      washers,
      vehicleStats,
      voucherStats,
      tierDistribution,
      pointsBalanceTotal,
      roleCounts,
      scheduleStats,
      cancellation,
    ] = await Promise.all([
      this.runOrderFacet(from, to, serviceId, topN),
      this.runWasherRanking(from, to, topN),
      this.runVehicleStats(topN),
      this.runVoucherStats(from, to, topN),
      this.runTierDistribution(),
      this.runPointsBalanceTotal(),
      this.runRoleCounts(from, to),
      this.runScheduleStats(from, to),
      this.runCancellationNoShow(from, to, topN),
    ]);

    const report = this.assemble({
      from,
      to,
      period,
      orderFacet,
      washers,
      vehicleStats,
      voucherStats,
      tierDistribution,
      pointsBalanceTotal,
      roleCounts,
      scheduleStats,
      cancellation,
    });

    // Scope is decided from the authenticated role, NOT from any request param.
    if (role === RoleEnum.ADMIN) {
      report.scope = 'full';
      return report;
    }

    report.scope = 'manager';
    report.customers.topBySpending = [];
    report.customers.topByVehicles = [];
    report.customers.topByBookings = [];
    report.voucherLoyalty.topCustomersByVouchers = [];
    report.cancellationNoShow.topCancellingCustomers =
      report.cancellationNoShow.topCancellingCustomers.map((r) => ({
        ...r,
        phoneMasked: null,
      }));
    report.cancellationNoShow.topNoShowCustomers =
      report.cancellationNoShow.topNoShowCustomers.map((r) => ({
        ...r,
        phoneMasked: null,
      }));
    return report;
  }

  // ─── Orders: one $facet pass over the windowed orders ──────────────────

  private async runOrderFacet(
    from: Date,
    to: Date,
    serviceId: Types.ObjectId | undefined,
    topN: number,
  ): Promise<OrderFacetResult> {
    const match: Record<string, unknown> = {
      scheduled_at: { $gte: from, $lte: to },
    };
    if (serviceId) match.service_type_id = serviceId;

    const topCustomerLookup: PipelineStage.FacetPipelineStage[] = [
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'u',
        },
      },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          name: {
            $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, 'Khách đã xoá'],
          },
          value: 1,
        },
      },
    ];

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: 'service_types',
          localField: 'service_type_id',
          foreignField: '_id',
          as: 'svc',
        },
      },
      {
        $lookup: {
          from: 'vehicles',
          localField: 'vehicle_id',
          foreignField: '_id',
          as: 'veh',
        },
      },
      {
        $set: {
          serviceName: {
            $ifNull: [{ $arrayElemAt: ['$svc.name', 0] }, 'Không xác định'],
          },
          vehicleTypeId: { $arrayElemAt: ['$veh.vehicle_type_id', 0] },
        },
      },
      {
        $lookup: {
          from: 'vehicle_types',
          localField: 'vehicleTypeId',
          foreignField: '_id',
          as: 'vt',
        },
      },
      {
        $set: {
          vehicleTypeName: {
            $ifNull: [{ $arrayElemAt: ['$vt.name', 0] }, 'Không xác định'],
          },
          hour: { $hour: { date: '$scheduled_at', timezone: TZ } },
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$scheduled_at',
              timezone: TZ,
            },
          },
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: '$scheduled_at',
              timezone: TZ,
            },
          },
          isRevenue: {
            $and: [
              { $eq: ['$status', 'completed'] },
              { $eq: ['$payment_status', 'paid'] },
            ],
          },
        },
      },
      {
        $facet: {
          statusCounts: [{ $group: { _id: '$status', c: { $sum: 1 } } }],
          revenueTotals: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: null,
                gross: { $sum: '$original_amount' },
                discount: { $sum: '$discount_amount' },
                net: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          refundTotals: [
            { $match: { payment_status: 'refunded' } },
            {
              $group: {
                _id: null,
                amount: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
          ],
          revByDay: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: '$day',
                revenue: { $sum: '$amount' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          revByMonth: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: '$month',
                revenue: { $sum: '$amount' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          revByService: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: '$serviceName',
                revenue: { $sum: '$amount' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
          ],
          revByVehicleType: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: '$vehicleTypeName',
                revenue: { $sum: '$amount' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
          ],
          revByPaymentMethod: [
            { $match: { isRevenue: true } },
            {
              $group: {
                _id: '$payment_method',
                revenue: { $sum: '$amount' },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
          ],
          bookingsByService: [
            { $group: { _id: '$serviceName', c: { $sum: 1 } } },
            { $sort: { c: -1 } },
          ],
          bookingsByVehicleType: [
            { $group: { _id: '$vehicleTypeName', c: { $sum: 1 } } },
            { $sort: { c: -1 } },
          ],
          byHour: [
            { $group: { _id: '$hour', c: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          trendByDay: [
            { $group: { _id: '$day', c: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          topSpending: [
            { $match: { isRevenue: true } },
            { $group: { _id: '$customer_id', value: { $sum: '$amount' } } },
            { $sort: { value: -1 } },
            { $limit: topN },
            ...topCustomerLookup,
          ],
          topBookings: [
            { $group: { _id: '$customer_id', value: { $sum: 1 } } },
            { $sort: { value: -1 } },
            { $limit: topN },
            ...topCustomerLookup,
          ],
          returningStats: [
            { $match: { status: 'completed' } },
            { $group: { _id: '$customer_id', c: { $sum: 1 } } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                returning: { $sum: { $cond: [{ $gt: ['$c', 1] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ];

    const [doc] = await this.orderModel
      .aggregate<OrderFacetResult>(pipeline)
      .exec();
    return doc ?? ({} as OrderFacetResult);
  }

  // ─── Washer performance (work_orders) ──────────────────────────────────

  private async runWasherRanking(from: Date, to: Date, topN: number) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          created_at: { $gte: from, $lte: to },
          assigned_washer_id: { $ne: null },
        },
      },
      {
        $lookup: {
          from: 'orders',
          localField: 'order_id',
          foreignField: '_id',
          as: 'ord',
        },
      },
      {
        $set: {
          isDone: { $eq: ['$status', 'done'] },
          ordPaid: {
            $and: [
              { $eq: [{ $arrayElemAt: ['$ord.status', 0] }, 'completed'] },
              { $eq: [{ $arrayElemAt: ['$ord.payment_status', 0] }, 'paid'] },
            ],
          },
          ordAmount: { $ifNull: [{ $arrayElemAt: ['$ord.amount', 0] }, 0] },
          durMin: {
            $cond: [
              {
                $and: [
                  { $ne: ['$started_at', null] },
                  { $ne: ['$finished_at', null] },
                ],
              },
              {
                $divide: [
                  { $subtract: ['$finished_at', '$started_at'] },
                  60000,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$assigned_washer_id',
          assignedJobs: { $sum: 1 },
          completedJobs: { $sum: { $cond: ['$isDone', 1, 0] } },
          revenueHandled: {
            $sum: {
              $cond: [{ $and: ['$isDone', '$ordPaid'] }, '$ordAmount', 0],
            },
          },
          reworkCount: { $sum: '$return_count' },
          durSum: {
            $sum: { $cond: [{ $ne: ['$durMin', null] }, '$durMin', 0] },
          },
          durCount: {
            $sum: { $cond: [{ $ne: ['$durMin', null] }, 1, 0] },
          },
          onTimeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$isDone',
                    { $ne: ['$durMin', null] },
                    { $lte: ['$durMin', '$estimated_minutes'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { completedJobs: -1, assignedJobs: -1 } },
      { $limit: topN },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'u',
        },
      },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          name: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, 'Thợ đã xoá'] },
          assignedJobs: 1,
          completedJobs: 1,
          revenueHandled: 1,
          reworkCount: 1,
          averageServiceMinutes: {
            $cond: [
              { $gt: ['$durCount', 0] },
              { $round: [{ $divide: ['$durSum', '$durCount'] }, 0] },
              0,
            ],
          },
          onTimeRate: {
            $cond: [
              { $gt: ['$completedJobs', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$onTimeCount', '$completedJobs'] },
                      100,
                    ],
                  },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    return this.workOrderModel
      .aggregate<{
        id: string;
        name: string;
        assignedJobs: number;
        completedJobs: number;
        revenueHandled: number;
        reworkCount: number;
        averageServiceMinutes: number;
        onTimeRate: number;
      }>(pipeline)
      .exec();
  }

  // ─── Vehicles (not date-bound) ──────────────────────────────────────────

  private async runVehicleStats(topN: number) {
    const [total, byType, topByVehicles] = await Promise.all([
      this.vehicleModel.countDocuments().exec(),
      this.vehicleModel
        .aggregate<CountRow>([
          {
            $lookup: {
              from: 'vehicle_types',
              localField: 'vehicle_type_id',
              foreignField: '_id',
              as: 'vt',
            },
          },
          {
            $group: {
              _id: {
                $ifNull: [{ $arrayElemAt: ['$vt.name', 0] }, 'Không xác định'],
              },
              c: { $sum: 1 },
            },
          },
          { $sort: { c: -1 } },
        ])
        .exec(),
      this.vehicleModel
        .aggregate<RankAggRow>([
          { $group: { _id: '$customer_id', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: topN },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'u',
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: {
                $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, 'Khách đã xoá'],
              },
              value: 1,
            },
          },
        ])
        .exec(),
    ]);

    return { total, byType, topByVehicles };
  }

  // ─── Vouchers & loyalty ────────────────────────────────────────────────

  private async runVoucherStats(from: Date, to: Date, topN: number) {
    const [statusCounts, voucherCostDoc, topByVouchers] = await Promise.all([
      this.voucherModel
        .aggregate<CountRow>([
          { $match: { created_at: { $gte: from, $lte: to } } },
          { $group: { _id: '$status', c: { $sum: 1 } } },
        ])
        .exec(),
      this.voucherModel
        .aggregate<{ _id: null; cost: number }>([
          {
            $match: {
              status: VoucherStatusEnum.USED,
              used_at: { $gte: from, $lte: to },
            },
          },
          { $group: { _id: null, cost: { $sum: '$discount_cap_vnd' } } },
        ])
        .exec(),
      this.voucherModel
        .aggregate<RankAggRow>([
          { $match: { created_at: { $gte: from, $lte: to } } },
          { $group: { _id: '$customer_id', value: { $sum: 1 } } },
          { $sort: { value: -1 } },
          { $limit: topN },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'u',
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: {
                $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, 'Khách đã xoá'],
              },
              value: 1,
            },
          },
        ])
        .exec(),
    ]);

    return {
      statusCounts,
      voucherCost: voucherCostDoc[0]?.cost ?? 0,
      topByVouchers,
    };
  }

  private async runTierDistribution(): Promise<NamedCount[]> {
    const rows = await this.loyaltyModel
      .aggregate<CountRow>([
        {
          $lookup: {
            from: 'tier_configs',
            localField: 'tier_config_id',
            foreignField: '_id',
            as: 'tc',
          },
        },
        {
          $group: {
            _id: {
              $ifNull: [{ $arrayElemAt: ['$tc.tier_name', 0] }, 'None'],
            },
            c: { $sum: 1 },
          },
        },
        { $sort: { c: -1 } },
      ])
      .exec();
    return rows.map((r) => ({ name: r._id ?? 'None', count: r.c }));
  }

  private async runPointsBalanceTotal(): Promise<number> {
    const [doc] = await this.loyaltyModel
      .aggregate<{
        _id: null;
        total: number;
      }>([{ $group: { _id: null, total: { $sum: '$points_balance' } } }])
      .exec();
    return doc?.total ?? 0;
  }

  // ─── Customer / washer headcounts via roles ────────────────────────────

  private async runRoleCounts(from: Date, to: Date) {
    const roles = await this.roleModel
      .find({ code: { $in: [RoleEnum.CUSTOMER, RoleEnum.WASHER] } })
      .select('_id code')
      .lean()
      .exec();
    const customerRoleId = roles.find((r) => r.code === RoleEnum.CUSTOMER)?._id;
    const washerRoleId = roles.find((r) => r.code === RoleEnum.WASHER)?._id;

    const [totalCustomers, newCustomers, activeWashers] = await Promise.all([
      customerRoleId
        ? this.userModel.countDocuments({ role_id: customerRoleId }).exec()
        : 0,
      customerRoleId
        ? this.userModel
            .countDocuments({
              role_id: customerRoleId,
              created_at: { $gte: from, $lte: to },
            })
            .exec()
        : 0,
      washerRoleId
        ? this.userModel
            .countDocuments({ role_id: washerRoleId, is_active: true })
            .exec()
        : 0,
    ]);

    return { totalCustomers, newCustomers, activeWashers };
  }

  // ─── Schedule & capacity (staff_shifts) ────────────────────────────────

  private async runScheduleStats(from: Date, to: Date) {
    const [totalShifts, bookedSlots] = await Promise.all([
      this.shiftModel
        .countDocuments({ start_at: { $gte: from, $lte: to } })
        .exec(),
      this.orderModel
        .countDocuments({
          scheduled_at: { $gte: from, $lte: to },
          status: { $ne: OrderStatusEnum.CANCELLED },
        })
        .exec(),
    ]);
    return { totalShifts, totalCapacity: totalShifts, bookedSlots };
  }

  // ─── Cancellation & no-show analytics ──────────────────────────────────

  private async runCancellationNoShow(from: Date, to: Date, topN: number) {
    const riskPipeline: PipelineStage[] = [
      {
        $set: {
          inWin: {
            $and: [
              { $gte: ['$updated_at', from] },
              { $lte: ['$updated_at', to] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$customer_id',
          total: { $sum: 1 },
          cancelledLife: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          noShowLife: {
            $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] },
          },
          cancelledWin: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'cancelled'] }, '$inWin'] },
                1,
                0,
              ],
            },
          },
          noShowWin: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'no_show'] }, '$inWin'] },
                1,
                0,
              ],
            },
          },
          lastCancelledAt: {
            $max: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, '$updated_at', null],
            },
          },
          lastNoShowAt: {
            $max: {
              $cond: [{ $eq: ['$status', 'no_show'] }, '$updated_at', null],
            },
          },
        },
      },
      {
        $facet: {
          cancelRank: [
            { $match: { cancelledWin: { $gt: 0 } } },
            { $sort: { cancelledWin: -1, cancelledLife: -1 } },
            { $limit: topN },
            ...riskLookup('cancelledWin', 'cancelledLife', 'lastCancelledAt'),
          ],
          noShowRank: [
            { $match: { noShowWin: { $gt: 0 } } },
            { $sort: { noShowWin: -1, noShowLife: -1 } },
            { $limit: topN },
            ...riskLookup('noShowWin', 'noShowLife', 'lastNoShowAt'),
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalCancelled: { $sum: '$cancelledWin' },
                totalNoShow: { $sum: '$noShowWin' },
              },
            },
          ],
        },
      },
    ];

    const breakdownPipeline: PipelineStage[] = [
      {
        $match: {
          status: { $in: ['cancelled', 'no_show'] },
          updated_at: { $gte: from, $lte: to },
        },
      },
      {
        $lookup: {
          from: 'service_types',
          localField: 'service_type_id',
          foreignField: '_id',
          as: 'svc',
        },
      },
      {
        $set: {
          serviceName: {
            $ifNull: [{ $arrayElemAt: ['$svc.name', 0] }, 'Không xác định'],
          },
          hour: { $hour: { date: '$scheduled_at', timezone: TZ } },
          day: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$updated_at',
              timezone: TZ,
            },
          },
          isCancel: { $eq: ['$status', 'cancelled'] },
          isNoShow: { $eq: ['$status', 'no_show'] },
        },
      },
      {
        $facet: {
          cancelledByService: [
            { $match: { isCancel: true } },
            { $group: { _id: '$serviceName', c: { $sum: 1 } } },
            { $sort: { c: -1 } },
          ],
          noShowByService: [
            { $match: { isNoShow: true } },
            { $group: { _id: '$serviceName', c: { $sum: 1 } } },
            { $sort: { c: -1 } },
          ],
          cancelledByHour: [
            { $match: { isCancel: true } },
            { $group: { _id: '$hour', c: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          noShowByHour: [
            { $match: { isNoShow: true } },
            { $group: { _id: '$hour', c: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          reasons: [
            { $match: { isCancel: true } },
            {
              $group: {
                _id: { $ifNull: ['$cancel_reason', ''] },
                c: { $sum: 1 },
              },
            },
            { $sort: { c: -1 } },
          ],
          trend: [
            {
              $group: {
                _id: '$day',
                cancelled: { $sum: { $cond: ['$isCancel', 1, 0] } },
                noShow: { $sum: { $cond: ['$isNoShow', 1, 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ];

    const [riskDoc] = await this.orderModel
      .aggregate<RiskFacetResult>(riskPipeline)
      .exec();
    const [breakdownDoc] = await this.orderModel
      .aggregate<BreakdownFacetResult>(breakdownPipeline)
      .exec();

    return {
      risk: riskDoc ?? ({} as RiskFacetResult),
      breakdown: breakdownDoc ?? ({} as BreakdownFacetResult),
    };
  }

  // ─── Assemble the typed report from the raw aggregation rows ───────────

  private assemble(input: AssembleInput): DashboardReport {
    const {
      from,
      to,
      period,
      orderFacet,
      washers,
      vehicleStats,
      voucherStats,
      tierDistribution,
      pointsBalanceTotal,
      roleCounts,
      scheduleStats,
      cancellation,
    } = input;

    const statusMap = toMap(orderFacet.statusCounts);
    const get = (k: string) => statusMap[k] ?? 0;

    const completed = get('completed');
    const cancelled = get('cancelled');
    const noShow = get('no_show');
    const pending =
      get('pending_payment') +
      get('confirmed') +
      get('checked_in') +
      get('in_progress');
    const totalBookings = completed + cancelled + noShow + pending;

    const rev = orderFacet.revenueTotals?.[0];
    const gross = rev?.gross ?? 0;
    const discount = rev?.discount ?? 0;
    const revCount = rev?.count ?? 0;
    const netGross = rev?.net ?? 0;
    const refundAmount = orderFacet.refundTotals?.[0]?.amount ?? 0;
    const refundCount = orderFacet.refundTotals?.[0]?.count ?? 0;
    const net = netGross - refundAmount;
    const averageOrderValue =
      revCount > 0 ? Math.round(netGross / revCount) : 0;

    const usedVoucherCount =
      toMap(voucherStats.statusCounts)[VoucherStatusEnum.USED] ?? 0;
    const unusedVoucherCount =
      toMap(voucherStats.statusCounts)[VoucherStatusEnum.UNUSED] ?? 0;
    const expiredVoucherCount =
      toMap(voucherStats.statusCounts)[VoucherStatusEnum.EXPIRED] ?? 0;
    const totalIssued =
      usedVoucherCount + unusedVoucherCount + expiredVoucherCount;

    const returning = orderFacet.returningStats?.[0];
    const customersWithOrders = returning?.total ?? 0;
    const returningCustomers = returning?.returning ?? 0;

    const qcRejections = washers.reduce((s, w) => s + w.reworkCount, 0);

    return {
      scope: 'full',
      range: {
        fromDate: from.toISOString(),
        toDate: to.toISOString(),
        period,
      },

      overview: {
        totalBookings,
        completedBookings: completed,
        pendingBookings: pending,
        cancelledBookings: cancelled,
        noShowBookings: noShow,
        grossRevenue: gross,
        discountAmount: discount,
        refundAmount,
        netRevenue: net,
        totalCustomers: roleCounts.totalCustomers,
        totalVehicles: vehicleStats.total,
        activeWashers: roleCounts.activeWashers,
        usedVouchers: usedVoucherCount,
        averageOrderValue,
      },

      revenue: {
        gross,
        discount,
        refund: refundAmount,
        net,
        averageOrderValue,
        byDay: mapBuckets(orderFacet.revByDay),
        byMonth: mapBuckets(orderFacet.revByMonth),
        byService: mapRevenue(orderFacet.revByService),
        byVehicleType: mapRevenue(orderFacet.revByVehicleType),
        byPaymentMethod: mapRevenue(orderFacet.revByPaymentMethod),
      },

      bookings: {
        statusSummary: {
          pending_payment: get('pending_payment'),
          confirmed: get('confirmed'),
          checked_in: get('checked_in'),
          in_progress: get('in_progress'),
          completed,
          cancelled,
          no_show: noShow,
        },
        completionRate: pct(completed, totalBookings),
        cancellationRate: pct(cancelled, totalBookings),
        noShowRate: pct(noShow, totalBookings),
        byHour: mapHours(orderFacet.byHour),
        byService: mapCounts(orderFacet.bookingsByService),
        byVehicleType: mapCounts(orderFacet.bookingsByVehicleType),
        trendByDay: (orderFacet.trendByDay ?? []).map((r) => ({
          key: r._id ?? '',
          count: r.c,
        })),
      },

      washers: washers.map((w) => ({
        id: w.id,
        name: w.name,
        completedJobs: w.completedJobs,
        assignedJobs: w.assignedJobs,
        averageServiceMinutes: w.averageServiceMinutes,
        revenueHandled: w.revenueHandled,
        reworkCount: w.reworkCount,
        onTimeRate: w.onTimeRate,
      })),

      customers: {
        topByVehicles: vehicleStats.topByVehicles,
        topByBookings: mapRank(orderFacet.topBookings),
        topBySpending: mapRank(orderFacet.topSpending),
        newCustomers: roleCounts.newCustomers,
        returningCustomers,
        retentionRate: pct(returningCustomers, customersWithOrders),
        tierDistribution,
      },

      vehicles: {
        total: vehicleStats.total,
        byType: mapCounts(vehicleStats.byType),
        revenueByType: mapRevenue(orderFacet.revByVehicleType),
        topType: vehicleStats.byType[0]?._id ?? null,
      },

      voucherLoyalty: {
        totalIssued,
        used: usedVoucherCount,
        unused: unusedVoucherCount,
        expired: expiredVoucherCount,
        redemptionRate: pct(usedVoucherCount, totalIssued),
        voucherCost: voucherStats.voucherCost,
        topCustomersByVouchers: voucherStats.topByVouchers,
        pointsBalanceTotal,
      },

      services: {
        mostUsed: mapCounts(orderFacet.bookingsByService),
        byRevenue: mapRevenue(orderFacet.revByService),
        averageDurationByService: [],
      },

      refundDispute: {
        refundCount,
        refundAmount,
        qcRejections,
        completedBookings: completed,
        reworkRate: pct(qcRejections, completed),
        disputesByWasher: washers
          .filter((w) => w.reworkCount > 0)
          .map<RankRow>((w) => ({
            id: w.id,
            name: w.name,
            value: w.reworkCount,
          })),
        notes: [
          'Hệ thống chưa có collection khiếu nại/tranh chấp riêng. Chỉ số "khiếu nại" tạm dùng số lần QC trả về (return_count) của work order làm proxy.',
          'Chưa có dữ liệu đánh giá (rating) của khách cho thợ rửa.',
        ],
      },

      cancellationNoShow: {
        totalCancelled: cancellation.risk.totals?.[0]?.totalCancelled ?? 0,
        totalNoShow: cancellation.risk.totals?.[0]?.totalNoShow ?? 0,
        cancellationRate: pct(cancelled, totalBookings),
        noShowRate: pct(noShow, totalBookings),
        topCancellingCustomers: mapRiskRows(cancellation.risk.cancelRank),
        topNoShowCustomers: mapRiskRows(cancellation.risk.noShowRank),
        cancelledByService: mapCounts(
          cancellation.breakdown.cancelledByService,
        ),
        noShowByService: mapCounts(cancellation.breakdown.noShowByService),
        cancelledByHour: mapHours(cancellation.breakdown.cancelledByHour),
        noShowByHour: mapHours(cancellation.breakdown.noShowByHour),
        cancellationReasons: (cancellation.breakdown.reasons ?? []).map(
          (r) => ({
            name: r._id && r._id.trim() ? r._id : 'Không có lý do',
            count: r.c,
          }),
        ),
        trendByDay: (cancellation.breakdown.trend ?? []).map((t) => ({
          key: t._id ?? '',
          cancelled: t.cancelled,
          noShow: t.noShow,
        })),
        notes: [
          'Order không có field cancelledAt/noShowAt - dùng updated_at làm thời điểm hủy/không đến (fallback).',
          'Không có field cancelledBy - chỉ thống kê theo khách hàng của đơn, không xác định được ai bấm hủy.',
        ],
      },

      schedule: {
        totalShifts: scheduleStats.totalShifts,
        totalCapacity: scheduleStats.totalCapacity,
        bookedSlots: scheduleStats.bookedSlots,
        availableSlots: Math.max(
          scheduleStats.totalCapacity - scheduleStats.bookedSlots,
          0,
        ),
        utilizationRate: pct(
          scheduleStats.bookedSlots,
          scheduleStats.totalCapacity,
        ),
        peakHours: [...mapHours(orderFacet.byHour)]
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      },
    };
  }
}

// ─── Pure mapping helpers ────────────────────────────────────────────────

function toMap(rows?: CountRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows ?? []) if (r._id != null) out[r._id] = r.c;
  return out;
}

function mapBuckets(rows?: RevenueRow[]) {
  return (rows ?? []).map((r) => ({
    key: r._id ?? '',
    revenue: r.revenue,
    orders: r.orders,
  }));
}

function mapRevenue(rows?: RevenueRow[]): NamedRevenue[] {
  return (rows ?? []).map((r) => ({
    name: r._id ?? 'Không xác định',
    revenue: r.revenue,
    orders: r.orders,
  }));
}

function mapCounts(rows?: CountRow[]): NamedCount[] {
  return (rows ?? []).map((r) => ({
    name: r._id ?? 'Không xác định',
    count: r.c,
  }));
}

function mapHours(rows?: CountRow[]): HourBucket[] {
  return (rows ?? []).map((r) => ({
    hour: Number(r._id ?? 0),
    count: r.c,
  }));
}

function mapRank(rows?: RankAggRow[]): RankRow[] {
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, value: r.value }));
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Mask a phone for display: 0901234567 -> 090****567. */
function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const p = phone.trim();
  if (p.length < 6) return '***';
  return `${p.slice(0, 3)}****${p.slice(-3)}`;
}

/** Shared facet tail for a customer-risk ranking: join the user, project row. */
function riskLookup(
  winField: string,
  lifeField: string,
  lastField: string,
): PipelineStage.FacetPipelineStage[] {
  return [
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'u',
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        name: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, 'Khách đã xoá'] },
        phone: { $arrayElemAt: ['$u.phone', 0] },
        totalBookings: '$total',
        count: `$${winField}`,
        rateNum: `$${lifeField}`,
        lastAt: `$${lastField}`,
      },
    },
  ];
}

function mapRiskRows(rows?: RiskRow[]): CustomerRiskRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    phoneMasked: maskPhone(r.phone),
    totalBookings: r.totalBookings,
    count: r.count,
    rate: pct(r.rateNum, r.totalBookings),
    lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
  }));
}

/** VN is a fixed UTC+7 offset (no DST), so the boundary can be built directly. */
const VN_OFFSET = '+07:00';

function vnDayStart(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00.000${VN_OFFSET}`);
}

function vnDayEnd(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T23:59:59.999${VN_OFFSET}`);
}

// ─── Internal aggregation result shapes ──────────────────────────────────

interface OrderFacetResult {
  statusCounts: CountRow[];
  revenueTotals: {
    _id: null;
    gross: number;
    discount: number;
    net: number;
    count: number;
  }[];
  refundTotals: { _id: null; amount: number; count: number }[];
  revByDay: RevenueRow[];
  revByMonth: RevenueRow[];
  revByService: RevenueRow[];
  revByVehicleType: RevenueRow[];
  revByPaymentMethod: RevenueRow[];
  bookingsByService: CountRow[];
  bookingsByVehicleType: CountRow[];
  byHour: CountRow[];
  trendByDay: CountRow[];
  topSpending: RankAggRow[];
  topBookings: RankAggRow[];
  returningStats: { _id: null; total: number; returning: number }[];
}

type RiskRow = {
  id: string;
  name: string;
  phone?: string | null;
  totalBookings: number;
  count: number;
  rateNum: number;
  lastAt?: Date | string | null;
};

interface RiskFacetResult {
  cancelRank: RiskRow[];
  noShowRank: RiskRow[];
  totals: { _id: null; totalCancelled: number; totalNoShow: number }[];
}

interface BreakdownFacetResult {
  cancelledByService: CountRow[];
  noShowByService: CountRow[];
  cancelledByHour: CountRow[];
  noShowByHour: CountRow[];
  reasons: CountRow[];
  trend: { _id: string; cancelled: number; noShow: number }[];
}

interface AssembleInput {
  from: Date;
  to: Date;
  period: string | null;
  orderFacet: OrderFacetResult;
  washers: {
    id: string;
    name: string;
    assignedJobs: number;
    completedJobs: number;
    revenueHandled: number;
    reworkCount: number;
    averageServiceMinutes: number;
    onTimeRate: number;
  }[];
  vehicleStats: {
    total: number;
    byType: CountRow[];
    topByVehicles: RankRow[];
  };
  voucherStats: {
    statusCounts: CountRow[];
    voucherCost: number;
    topByVouchers: RankRow[];
  };
  tierDistribution: NamedCount[];
  pointsBalanceTotal: number;
  roleCounts: {
    totalCustomers: number;
    newCustomers: number;
    activeWashers: number;
  };
  scheduleStats: {
    totalShifts: number;
    totalCapacity: number;
    bookedSlots: number;
  };
  cancellation: {
    risk: RiskFacetResult;
    breakdown: BreakdownFacetResult;
  };
}
