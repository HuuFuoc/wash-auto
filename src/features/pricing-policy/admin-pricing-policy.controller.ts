import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
import { PricingPolicyResponseDto } from './dto/pricing-policy-response.dto';
import { UpdatePricingPolicyDto } from './dto/update-pricing-policy.dto';
import { PricingPolicyService } from './pricing-policy.service';

@ApiTags('admin · pricing-policy')
@ApiBearerAuth()
@Controller('admin/pricing-policy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
export class AdminPricingPolicyController {
  constructor(private readonly service: PricingPolicyService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the global pricing policy (admin)',
    description: 'Returns the current max stacked discount cap.',
  })
  @ApiResponse({ status: 200, type: PricingPolicyResponseDto })
  get(): Promise<PricingPolicyResponseDto> {
    return this.service.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the global pricing policy (admin)',
    description:
      'Sets the ceiling for the golden-hour + tier discount stack, applied ' +
      'before vouchers. The booking price is clamped down to this percent.',
  })
  @ApiResponse({ status: 200, type: PricingPolicyResponseDto })
  update(
    @Body() dto: UpdatePricingPolicyDto,
  ): Promise<PricingPolicyResponseDto> {
    return this.service.update(dto);
  }
}
