import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { CreateVehicleTypeDto } from './dto/create-vehicle-type.dto';
import { SetVehicleTypeStatusDto } from './dto/set-vehicle-type-status.dto';
import { UpdateVehicleTypeDto } from './dto/update-vehicle-type.dto';
import { VehicleTypeResponseDto } from './dto/vehicle-type-response.dto';
import { VehicleTypeService } from './vehicle-type.service';

@ApiTags('admin · vehicle-types')
@ApiBearerAuth()
@Controller('admin/vehicle-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
export class AdminVehicleTypeController {
  constructor(private readonly service: VehicleTypeService) {}

  @Get()
  @ApiOperation({
    summary: 'List all vehicle types incl. inactive (admin/manager)',
    description:
      'Same as the public list but includes inactive entries - use on the catalog management screen.',
  })
  @ApiResponse({ status: 200, type: VehicleTypeResponseDto, isArray: true })
  listAll(): Promise<VehicleTypeResponseDto[]> {
    return this.service.listAll();
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new vehicle type (admin/manager)',
    description:
      'Adds a vehicle type customers can attach to their cars. Name is unique across the catalog.',
  })
  @ApiBody({
    type: CreateVehicleTypeDto,
    examples: {
      motorbike: {
        summary: 'Motorbike',
        value: { name: 'Motorbike', description: '2-wheel motor vehicles' },
      },
      car: {
        summary: 'Car',
        value: { name: 'Car', description: '4-wheel passenger cars' },
      },
      suv: {
        summary: 'SUV',
        value: { name: 'SUV', description: 'Sport utility vehicles' },
      },
    },
  })
  @ApiResponse({ status: 201, type: VehicleTypeResponseDto })
  @ApiResponse({ status: 409, description: 'Vehicle type name already exists' })
  create(@Body() dto: CreateVehicleTypeDto): Promise<VehicleTypeResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a vehicle type (admin/manager)',
    description:
      'Partial update - only include fields you want to change. Use PATCH /:id/status to toggle visibility.',
  })
  @ApiResponse({ status: 200, type: VehicleTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle type not found' })
  @ApiResponse({ status: 409, description: 'Vehicle type name already exists' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleTypeDto,
  ): Promise<VehicleTypeResponseDto> {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a vehicle type (admin/manager)',
    description:
      'Soft toggle - existing vehicles referencing this type keep working, but the public list hides inactive ones.',
  })
  @ApiResponse({ status: 200, type: VehicleTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle type not found' })
  setActive(
    @Param('id') id: string,
    @Body() dto: SetVehicleTypeStatusDto,
  ): Promise<VehicleTypeResponseDto> {
    return this.service.setActive(id, dto.isActive);
  }
}
