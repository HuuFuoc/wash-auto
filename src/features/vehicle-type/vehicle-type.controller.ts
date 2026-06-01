import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VehicleTypeResponseDto } from './dto/vehicle-type-response.dto';
import { VehicleTypeService } from './vehicle-type.service';

@ApiTags('vehicle-types')
@Controller('vehicle-types')
export class VehicleTypeController {
  constructor(private readonly service: VehicleTypeService) {}

  @Get()
  @ApiOperation({
    summary: 'List active vehicle types (public)',
    description:
      'Returns active types sorted by name. Use this to populate the vehicle-type picker when a customer registers a car.',
  })
  @ApiResponse({ status: 200, type: VehicleTypeResponseDto, isArray: true })
  list(): Promise<VehicleTypeResponseDto[]> {
    return this.service.listActive();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a vehicle type by id (public)',
    description:
      'Returns one type regardless of active status - useful when a vehicle references a type that was later deactivated.',
  })
  @ApiResponse({ status: 200, type: VehicleTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Vehicle type not found' })
  getOne(@Param('id') id: string): Promise<VehicleTypeResponseDto> {
    return this.service.getById(id);
  }
}
