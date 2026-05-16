import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { LoyaltyAccountResponseDto } from './dto/loyalty-account-response.dto';
import { LoyaltyService } from './loyalty.service';

@ApiTags('me · loyalty')
@ApiBearerAuth()
@Controller('me/loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  @Get()
  @ApiOperation({
    summary: 'Get my loyalty account (lazy-creates if missing)',
    description:
      'Returns the authenticated user loyalty account: current tier, points balance, monthly visit counters. Auto-creates the account at Member tier if it does not exist yet (so customers registered before this feature was deployed still get one on first call).',
  })
  @ApiResponse({ status: 200, type: LoyaltyAccountResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getMine(
    @CurrentUser() user: IAuthPayload,
  ): Promise<LoyaltyAccountResponseDto> {
    return this.service.getForCustomer(user.sub);
  }
}
