import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { LoyaltyAccountResponseDto } from './dto/loyalty-account-response.dto';
import { LoyaltyTransactionListResponseDto } from './dto/loyalty-transaction-response.dto';
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
      'Returns the authenticated user loyalty account: current tier, points balance, wash counters. Auto-creates the account at None tier if it does not exist yet (so customers registered before this feature was deployed still get one on first call).',
  })
  @ApiResponse({ status: 200, type: LoyaltyAccountResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getMine(
    @CurrentUser() user: IAuthPayload,
  ): Promise<LoyaltyAccountResponseDto> {
    return this.service.getForCustomer(user.sub);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'List my loyalty point transactions',
    description:
      'Paginated audit trail of point earnings, deductions, voucher mints, tier changes, and annual resets. Newest first.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, type: LoyaltyTransactionListResponseDto })
  listTransactions(
    @CurrentUser() user: IAuthPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<LoyaltyTransactionListResponseDto> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    return this.service.listTransactions(user.sub, safePage, safeLimit);
  }
}
