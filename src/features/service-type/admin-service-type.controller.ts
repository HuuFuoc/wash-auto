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
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { ServiceTypeResponseDto } from './dto/service-type-response.dto';
import { SetServiceTypeStatusDto } from './dto/set-service-type-status.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { ServiceTypeService } from './service-type.service';

@ApiTags('admin · service-types')
@ApiBearerAuth()
@Controller('admin/service-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
export class AdminServiceTypeController {
  constructor(private readonly service: ServiceTypeService) {}

  @Get()
  @ApiOperation({ summary: 'List all service types incl. inactive' })
  @ApiResponse({ status: 200, type: ServiceTypeResponseDto, isArray: true })
  listAll(): Promise<ServiceTypeResponseDto[]> {
    return this.service.listAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new service type' })
  @ApiResponse({ status: 201, type: ServiceTypeResponseDto })
  @ApiResponse({ status: 409, description: 'Service type name already exists' })
  create(@Body() dto: CreateServiceTypeDto): Promise<ServiceTypeResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a service type' })
  @ApiResponse({ status: 200, type: ServiceTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Service type not found' })
  @ApiResponse({ status: 409, description: 'Service type name already exists' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceTypeDto,
  ): Promise<ServiceTypeResponseDto> {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a service type' })
  @ApiResponse({ status: 200, type: ServiceTypeResponseDto })
  @ApiResponse({ status: 404, description: 'Service type not found' })
  setActive(
    @Param('id') id: string,
    @Body() dto: SetServiceTypeStatusDto,
  ): Promise<ServiceTypeResponseDto> {
    return this.service.setActive(id, dto.isActive);
  }
}
