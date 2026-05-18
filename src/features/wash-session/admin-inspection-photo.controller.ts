import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { AddInspectionPhotoDto } from './dto/add-inspection-photo.dto';
import { InspectionPhotoResponseDto } from './dto/inspection-photo-response.dto';
import { InspectionPhotoService } from './inspection-photo.service';

@ApiTags('admin · inspection-photos')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminInspectionPhotoController {
  constructor(private readonly service: InspectionPhotoService) {}

  @Post('inspections/:inspectionId/photos')
  @ApiOperation({
    summary: 'Add a photo URL to an inspection',
    description:
      'FE uploads the image to Cloudinary/S3 first, then sends the URL here. Allowed mime: image/jpeg, image/png, image/webp. Max size 10MB.',
  })
  @ApiResponse({ status: 201, type: InspectionPhotoResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid URL/mime/size' })
  @ApiResponse({ status: 404, description: 'Inspection not found' })
  add(
    @Param('inspectionId') inspectionId: string,
    @Body() dto: AddInspectionPhotoDto,
  ): Promise<InspectionPhotoResponseDto> {
    return this.service.add(inspectionId, dto);
  }

  @Get('inspections/:inspectionId/photos')
  @ApiOperation({ summary: 'List photos for an inspection' })
  @ApiResponse({
    status: 200,
    type: InspectionPhotoResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 404, description: 'Inspection not found' })
  list(
    @Param('inspectionId') inspectionId: string,
  ): Promise<InspectionPhotoResponseDto[]> {
    return this.service.listByInspection(inspectionId);
  }

  @Delete('inspection-photos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an inspection photo' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Inspection photo not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.service.remove(id);
  }
}
