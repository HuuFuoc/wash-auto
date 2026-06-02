import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { RoleEnum } from '../auth/types/role.enum';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import { DashboardReport } from './types/dashboard-report.type';

/**
 * Management Reporting / Operational Analytics dashboard.
 *
 * A single consolidated endpoint returns every report group (overview KPIs,
 * revenue, bookings, washer performance, customer/vehicle/voucher/service
 * analytics, refund-dispute and schedule capacity). All figures are
 * aggregated live from real collections - no mock data.
 */
@ApiTags('admin · dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.MANAGER, RoleEnum.ADMIN)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Management reporting dashboard (manager/admin)',
    description:
      'Consolidated analytics over orders, payments, washers, vehicles, ' +
      'vouchers, loyalty and shifts. Filter by fromDate/toDate (bounds the ' +
      'order scheduled_at window) and optional serviceId. Revenue is counted ' +
      'only on completed + paid orders; refunds are subtracted from net. ' +
      'Scope is derived from the JWT role (never the request): ADMIN gets the ' +
      'full report, MANAGER gets an operational view with customer-identifying ' +
      'rankings redacted server-side.',
  })
  getReport(
    @Query() query: QueryDashboardDto,
    @CurrentUser() user: IAuthPayload,
  ): Promise<DashboardReport> {
    return this.service.getReport(query, user.role);
  }
}
