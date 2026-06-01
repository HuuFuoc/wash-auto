import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RoleEnum } from '../auth/types/role.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { GrantVoucherAdminDto } from './dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from './dto/query-voucher.dto';
import { RevokeVoucherDto } from './dto/revoke-voucher.dto';
import { VoucherListResponseDto } from './dto/voucher-list-response.dto';
import { VoucherResponseDto } from './dto/voucher-response.dto';
import { VoucherService } from './voucher.service';

@ApiTags('admin · vouchers')
@ApiBearerAuth()
@Controller('admin/vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER)
export class AdminVoucherController {
  constructor(private readonly service: VoucherService) {}

  @Post()
  @ApiOperation({
    summary: 'Grant a voucher manually (admin/manager)',
    description:
      'Mints a FREE_WASH voucher for a specific customer with the same ' +
      'shape as a milestone-issued voucher. Used for service recovery ' +
      'comps, marketing campaigns, or one-off promotions. The discount ' +
      'cap is enforced ≤ 200k VND in the DTO so a typo cannot blow up ' +
      'the program economics.',
  })
  @ApiResponse({ status: 201, type: VoucherResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Target customer not found / inactive / not a customer account',
  })
  grant(@Body() dto: GrantVoucherAdminDto): Promise<VoucherResponseDto> {
    return this.service.adminGrantForCustomer(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all vouchers (admin/manager)',
    description:
      'Paginated listing across every customer. Filter by status (unused/' +
      'used/expired) or by customerId. Sorted by creation date descending.',
  })
  @ApiResponse({ status: 200, type: VoucherListResponseDto })
  list(@Query() query: QueryVoucherDto): Promise<VoucherListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one voucher (admin/manager)' })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  @ApiResponse({ status: 404, description: 'Voucher not found' })
  getOne(@Param('id') id: string): Promise<VoucherResponseDto> {
    return this.service.adminGetById(id);
  }

  @Patch(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke an unused voucher (admin/manager)',
    description:
      'Flips an UNUSED voucher to EXPIRED early - used for fraud, wrong-' +
      'customer grants, or campaign rollback. Fails 409 if the voucher ' +
      'is already USED or EXPIRED. A reason is recorded in granted_reason.',
  })
  @ApiResponse({ status: 200, type: VoucherResponseDto })
  @ApiResponse({ status: 404, description: 'Voucher not found' })
  @ApiResponse({
    status: 409,
    description: 'Voucher already used or expired',
  })
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeVoucherDto,
  ): Promise<VoucherResponseDto> {
    return this.service.adminRevoke(id, dto.reason);
  }
}
