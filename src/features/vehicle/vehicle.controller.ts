import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { VehicleService } from './vehicle.service';

@ApiTags('me · vehicles')
@ApiBearerAuth()
@Controller('me/vehicles')
@UseGuards(JwtAuthGuard)
export class VehicleController {
  constructor(private readonly service: VehicleService) {}

  @Get()
  @ApiOperation({
    summary: 'List my vehicles',
    description:
      'Returns the authenticated user own vehicles, default first then most recent. Inactive (soft-deleted) vehicles are hidden.',
  })
  @ApiResponse({ status: 200, type: VehicleResponseDto, isArray: true })
  list(@CurrentUser() user: IAuthPayload): Promise<VehicleResponseDto[]> {
    return this.service.listOwn(user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of my vehicles',
    description:
      'Returns 404 if the id is unknown or belongs to another customer (ownership-protected).',
  })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<VehicleResponseDto> {
    return this.service.getOwn(user.sub, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a vehicle',
    description:
      'License plate must be unique across all customers. First active vehicle of a customer is auto-marked as default.',
  })
  @ApiResponse({ status: 201, type: VehicleResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Vehicle type not found or inactive',
  })
  @ApiResponse({ status: 409, description: 'License plate already registered' })
  create(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateVehicleDto,
  ): Promise<VehicleResponseDto> {
    return this.service.createOwn(user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update one of my vehicles',
    description:
      'Partial update - only include changed fields. Use PATCH /:id/set-default to change default vehicle.',
  })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  @ApiResponse({ status: 409, description: 'License plate already registered' })
  update(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<VehicleResponseDto> {
    return this.service.updateOwn(user.sub, id, dto);
  }

  @Patch(':id/set-default')
  @ApiOperation({
    summary: 'Mark a vehicle as default',
    description:
      'Marks this vehicle is_default=true and unsets the flag on the customer other vehicles.',
  })
  @ApiResponse({ status: 200, type: VehicleResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Cannot set inactive vehicle as default',
  })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  setDefault(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<VehicleResponseDto> {
    return this.service.setDefaultOwn(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a vehicle (soft delete)',
    description:
      'Sets is_active=false and clears is_default. Existing bookings keep their reference but new bookings cannot use it.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  remove(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.softDeleteOwn(user.sub, id);
  }
}
