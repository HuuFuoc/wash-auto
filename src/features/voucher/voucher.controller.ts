import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { VoucherResponseDto } from './dto/voucher-response.dto';
import { VoucherStatusEnum } from './types/voucher-status.enum';
import { VoucherService } from './voucher.service';

@ApiTags('me · vouchers')
@ApiBearerAuth()
@Controller('me/vouchers')
@UseGuards(JwtAuthGuard)
export class VoucherController {
  constructor(private readonly service: VoucherService) {}

  @Get()
  @ApiOperation({
    summary: 'List my vouchers',
    description:
      'Returns vouchers owned by the authenticated customer. Filter with ?status=unused to show only redeemable vouchers.',
  })
  @ApiQuery({ name: 'status', enum: VoucherStatusEnum, required: false })
  @ApiResponse({ status: 200, type: VoucherResponseDto, isArray: true })
  list(
    @CurrentUser() user: IAuthPayload,
    @Query('status') status?: VoucherStatusEnum,
  ): Promise<VoucherResponseDto[]> {
    return this.service.listForCustomer(user.sub, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one voucher (must be owned by caller)' })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  @ApiResponse({ status: 404, description: 'Voucher not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<VoucherResponseDto> {
    return this.service.getForCustomer(user.sub, id);
  }
}
