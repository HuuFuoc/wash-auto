import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ServiceTypeResponseDto } from './dto/service-type-response.dto';
import { ServiceTypeService } from './service-type.service';

@ApiTags('service-types')
@Controller('service-types')
export class ServiceTypeController {
  constructor(private readonly service: ServiceTypeService) {}

  @Get()
  @ApiOperation({ summary: 'List active service types (public)' })
  @ApiResponse({ status: 200, type: ServiceTypeResponseDto, isArray: true })
  list(): Promise<ServiceTypeResponseDto[]> {
    return this.service.listActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a service type by id (public)' })
  @ApiResponse({ status: 200, type: ServiceTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Service type not found' })
  getOne(@Param('id') id: string): Promise<ServiceTypeResponseDto> {
    return this.service.getById(id);
  }
}
