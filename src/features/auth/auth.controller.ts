import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
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
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import {
  OtpSendResponseDto,
  OtpVerifyResponseDto,
} from './dto/otp-response.dto';
import { OtpSendDto } from './dto/otp-send.dto';
import { OtpVerifyDto } from './dto/otp-verify.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { RoleEnum } from './types/role.enum';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Email or phone already registered',
  })
  async register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive access + refresh tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new pair' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid, revoked, or expired refresh token',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token (blacklist its jti)' })
  @ApiResponse({ status: 204 })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send an email verification OTP',
    description:
      'Rate limited per email (1/min cooldown + 5/hour cap). If the account is already verified within the configured skip window (default 7 days), no OTP is sent and a verified-email JWT is returned directly. Response shape is identical for unknown emails.',
  })
  @ApiResponse({ status: 200, type: OtpSendResponseDto })
  @ApiResponse({ status: 429, description: 'Too many OTP requests' })
  sendOtp(
    @Body() dto: OtpSendDto,
    @Ip() ip: string,
  ): Promise<OtpSendResponseDto> {
    return this.authService.requestEmailOtp(dto.email, ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an OTP and receive a verified-email JWT',
    description:
      'Returns a JWT with scope=email_verified (15m TTL). Use it as the Authorization Bearer when calling POST /me/bookings.',
  })
  @ApiResponse({ status: 200, type: OtpVerifyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Ip() ip: string,
  ): Promise<OtpVerifyResponseDto> {
    return this.authService.verifyEmailOtp(dto.email, dto.code, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user payload' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getMe(@CurrentUser() user: IAuthPayload): IAuthPayload {
    return user;
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleEnum.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Demo endpoint restricted to admin role' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Authenticated but not an admin' })
  adminOnly(@CurrentUser() user: IAuthPayload): {
    ok: true;
    user: IAuthPayload;
  } {
    return { ok: true, user };
  }
}
