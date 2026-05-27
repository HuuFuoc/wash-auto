import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TierConfigResponseDto } from './dto/tier-config-response.dto';
import { TierConfigService } from './tier-config.service';

@ApiTags('tier-configs')
@Controller('tier-configs')
export class TierConfigController {
  constructor(private readonly service: TierConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'List active tiers (public)',
    description:
      'Customer-facing endpoint to show loyalty tier ladder. Sorted ascending by priority_level (None → Gold).',
  })
  @ApiResponse({ status: 200, type: TierConfigResponseDto, isArray: true })
  list(): Promise<TierConfigResponseDto[]> {
    return this.service.listActive();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a tier by id (public)',
    description: 'Returns regardless of active status.',
  })
  @ApiResponse({ status: 200, type: TierConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  getOne(@Param('id') id: string): Promise<TierConfigResponseDto> {
    return this.service.getById(id);
  }
}
