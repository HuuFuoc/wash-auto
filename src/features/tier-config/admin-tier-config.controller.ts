import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { SetTierConfigStatusDto } from './dto/set-tier-config-status.dto';
import { TierConfigResponseDto } from './dto/tier-config-response.dto';
import { UpdateTierConfigDto } from './dto/update-tier-config.dto';
import { TierConfigService } from './tier-config.service';

@ApiTags('admin · tier-configs')
@ApiBearerAuth()
@Controller('admin/tier-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
export class AdminTierConfigController {
  constructor(private readonly service: TierConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'List all tiers incl. inactive (admin)',
    description:
      'Returns 4 default tiers (None/Bronze/Silver/Gold) sorted by priority_level.',
  })
  @ApiResponse({ status: 200, type: TierConfigResponseDto, isArray: true })
  listAll(): Promise<TierConfigResponseDto[]> {
    return this.service.listAll();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update tier config (admin)',
    description:
      'Tune booking_window_days, points_per_1000_vnd, min_loyalty_points, discount_percent, or priority_level. Tier names are immutable (set at seed time).',
  })
  @ApiResponse({ status: 200, type: TierConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  @ApiResponse({ status: 409, description: 'priorityLevel already used' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTierConfigDto,
  ): Promise<TierConfigResponseDto> {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a tier (admin)',
    description:
      'Soft toggle. Inactive tiers stay assignable for existing loyalty accounts but hidden from the customer-facing list.',
  })
  @ApiResponse({ status: 200, type: TierConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetTierConfigStatusDto,
  ): Promise<TierConfigResponseDto> {
    return this.service.setStatus(id, dto);
  }
}
