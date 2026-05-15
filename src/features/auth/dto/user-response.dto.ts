import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserDocument } from '../entities/user.entity';
import { RoleEnum } from '../types/role.enum';

export class UserResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ enum: RoleEnum, example: RoleEnum.CUSTOMER })
  role: RoleEnum;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({ example: '0901234567' })
  phone: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '1995-01-15T00:00:00.000Z' })
  dateOfBirth?: Date;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(user: UserDocument, roleCode: RoleEnum): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user._id.toString();
    dto.role = roleCode;
    dto.name = user.name;
    dto.phone = user.phone;
    dto.email = user.email;
    dto.avatarUrl = user.avatar_url;
    dto.dateOfBirth = user.date_of_birth;
    dto.isActive = user.is_active;
    return dto;
  }
}
