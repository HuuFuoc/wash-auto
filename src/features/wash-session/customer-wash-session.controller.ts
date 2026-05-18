import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { WashSessionResponseDto } from './dto/wash-session-response.dto';
import { WashSessionService } from './wash-session.service';

@ApiTags('me · wash-sessions')
@ApiBearerAuth()
@Controller('me/wash-sessions')
@UseGuards(JwtAuthGuard)
export class CustomerWashSessionController {
  constructor(private readonly service: WashSessionService) {}

  @Get()
  @ApiOperation({
    summary: 'List my wash history',
    description:
      'Returns the authenticated customer wash sessions, most recent first.',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto, isArray: true })
  list(@CurrentUser() user: IAuthPayload): Promise<WashSessionResponseDto[]> {
    return this.service.customerListMine(user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of my wash sessions',
    description: 'Ownership-protected — 404 if it belongs to another customer.',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WashSessionResponseDto> {
    return this.service.customerGetMine(user.sub, id);
  }
}
