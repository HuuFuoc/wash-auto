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
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { CreateGoldenHourDto } from './dto/create-golden-hour.dto';
import { GoldenHourResponseDto } from './dto/golden-hour-response.dto';
import { UpdateGoldenHourDto } from './dto/update-golden-hour.dto';
import { GoldenHourService } from './golden-hour.service';

@ApiTags('admin · golden-hours')
@ApiBearerAuth()
@Controller('admin/golden-hours')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminGoldenHourController {
  constructor(private readonly service: GoldenHourService) {}

  @Get()
  @ApiOperation({
    summary: 'List all golden-hour windows incl. inactive (manager/admin)',
    description: 'Sorted by start time. Inactive windows are included.',
  })
  @ApiResponse({ status: 200, type: GoldenHourResponseDto, isArray: true })
  list(): Promise<GoldenHourResponseDto[]> {
    return this.service.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Create a golden-hour window (manager/admin)',
    description:
      'Times are minutes since local midnight; endMinute must be greater ' +
      'than startMinute. Empty daysOfWeek means every day. New windows are ' +
      'active by default.',
  })
  @ApiResponse({ status: 201, type: GoldenHourResponseDto })
  @ApiResponse({
    status: 400,
    description: 'endMinute ≤ startMinute, or invalid IANA timezone',
  })
  @ApiResponse({ status: 409, description: 'A window with that name exists' })
  create(@Body() dto: CreateGoldenHourDto): Promise<GoldenHourResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a golden-hour window (manager/admin)',
    description:
      'Partial update. Send only the fields to change; use isActive to ' +
      'toggle the window on/off.',
  })
  @ApiResponse({ status: 200, type: GoldenHourResponseDto })
  @ApiResponse({
    status: 400,
    description: 'endMinute ≤ startMinute, or invalid IANA timezone',
  })
  @ApiResponse({ status: 404, description: 'Golden hour not found' })
  @ApiResponse({ status: 409, description: 'A window with that name exists' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGoldenHourDto,
  ): Promise<GoldenHourResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a golden-hour window (manager/admin)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Golden hour not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
