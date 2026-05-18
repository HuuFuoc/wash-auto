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
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { RoleEnum } from '../auth/types/role.enum';
import { AcknowledgeInspectionDto } from './dto/acknowledge-inspection.dto';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { InspectionResponseDto } from './dto/inspection-response.dto';
import { InspectionService } from './inspection.service';

@ApiTags('admin · inspections')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminInspectionController {
  constructor(private readonly service: InspectionService) {}

  @Post('wash-sessions/:sessionId/inspections')
  @ApiOperation({
    summary: 'Create inspection (before/after) for a wash session',
    description:
      "phase='before' allowed when session is WAITING/ASSIGNED. phase='after' allowed when session is DONE. Each phase can only be created once per session (unique index).",
  })
  @ApiResponse({ status: 201, type: InspectionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Wrong session state for the phase',
  })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  @ApiResponse({
    status: 409,
    description: 'Inspection for this phase already exists',
  })
  create(
    @CurrentUser() user: IAuthPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateInspectionDto,
  ): Promise<InspectionResponseDto> {
    return this.service.create(user.sub, sessionId, dto);
  }

  @Get('wash-sessions/:sessionId/inspections')
  @ApiOperation({
    summary: 'List inspections for a wash session',
    description: 'Returns 0, 1, or 2 records (before / after).',
  })
  @ApiResponse({ status: 200, type: InspectionResponseDto, isArray: true })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  listBySession(
    @Param('sessionId') sessionId: string,
  ): Promise<InspectionResponseDto[]> {
    return this.service.listBySession(sessionId);
  }

  @Patch('inspections/:id/acknowledge')
  @ApiOperation({
    summary: 'Mark customer acknowledgement on an inspection',
    description:
      'Cashier marks customer_acknowledged=true after the customer confirms in person. Optionally stores a signature image URL.',
  })
  @ApiResponse({ status: 200, type: InspectionResponseDto })
  @ApiResponse({ status: 404, description: 'Inspection not found' })
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeInspectionDto,
  ): Promise<InspectionResponseDto> {
    return this.service.acknowledge(id, dto);
  }
}
