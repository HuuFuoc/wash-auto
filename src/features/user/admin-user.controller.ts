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
  Put,
  Query,
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
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { RoleEnum } from '../auth/types/role.enum';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { SetUserStatusDto } from './dto/set-user-status.dto';
import { SetWasherSkillsDto } from './dto/set-washer-skills.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListResponseDto } from './dto/user-list-response.dto';
import { WasherSkillsResponseDto } from './dto/washer-skills-response.dto';
import { UserService } from './user.service';

@ApiTags('admin · users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN)
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List users with filter + pagination' })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  list(@Query() query: QueryUserDto): Promise<UserListResponseDto> {
    return this.userService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  getOne(@Param('id') id: string): Promise<UserResponseDto> {
    return this.userService.getOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user (admin assigns role)' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'Email or phone already exists' })
  create(@Body() dto: CreateUserAdminDto): Promise<UserResponseDto> {
    return this.userService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile fields' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Phone already in use' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, dto);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a user role' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.userService.changeRole(id, dto);
  }

  @Get(':id/washer-skills')
  @Roles(RoleEnum.MANAGER, RoleEnum.ADMIN)
  @ApiOperation({
    summary: 'Get a washer’s (service, vehicle type) skills (manager/admin)',
  })
  @ApiResponse({ status: 200, type: WasherSkillsResponseDto })
  @ApiResponse({ status: 400, description: 'User is not a washer' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getWasherSkills(@Param('id') id: string): Promise<WasherSkillsResponseDto> {
    return this.userService.getWasherSkills(id);
  }

  @Put(':id/washer-skills')
  @Roles(RoleEnum.MANAGER, RoleEnum.ADMIN)
  @ApiOperation({
    summary: 'Set a washer’s (service, vehicle type) skills (manager/admin)',
    description:
      'Replaces the full skill list. Each pair must be an active service that ' +
      'applies to the given vehicle type. An empty array clears all skills, ' +
      'after which the washer is never auto-assigned any car.',
  })
  @ApiResponse({ status: 200, type: WasherSkillsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'User is not a washer, or an invalid skill pair',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  setWasherSkills(
    @Param('id') id: string,
    @Body() dto: SetWasherSkillsDto,
  ): Promise<WasherSkillsResponseDto> {
    return this.userService.setWasherSkills(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Cannot deactivate self' })
  @ApiResponse({ status: 404, description: 'User not found' })
  setStatus(
    @CurrentUser() actor: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: SetUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.userService.setStatus(actor.sub, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset user password (admin sets new value)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'User not found' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ): Promise<{ message: string }> {
    return this.userService.resetPassword(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Cannot delete self' })
  @ApiResponse({ status: 404, description: 'User not found' })
  softDelete(
    @CurrentUser() actor: IAuthPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.userService.softDelete(actor.sub, id);
  }
}
