import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { VehicleListResponseDto } from './dto/vehicle-list-response.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { VehicleService } from './vehicle.service';

@ApiTags('admin · vehicles')
@ApiBearerAuth()
@Controller('admin/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
export class AdminVehicleController {
  constructor(private readonly service: VehicleService) {}

  @Get()
  @ApiOperation({
    summary: 'List all vehicles with filters (admin/manager)',
    description:
      'Paginated. Filter by customerId, vehicleTypeId, partial licensePlate (case-insensitive), isActive.',
  })
  @ApiResponse({ status: 200, type: VehicleListResponseDto })
  list(@Query() query: QueryVehicleDto): Promise<VehicleListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get any vehicle by id (admin/manager)',
    description: 'Returns 404 if id is invalid or unknown.',
  })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  getOne(@Param('id') id: string): Promise<VehicleResponseDto> {
    return this.service.adminGetOne(id);
  }
}
