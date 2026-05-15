import { ApiProperty } from '@nestjs/swagger';
import { UserDocument } from '../entities/user.entity';
import { RoleEnum } from '../types/role.enum';

export class UserResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  fullName: string;

  @ApiProperty({ enum: RoleEnum, example: RoleEnum.CUSTOMER })
  role: RoleEnum;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(user: UserDocument): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user._id.toString();
    dto.email = user.email;
    dto.fullName = user.fullName;
    dto.role = user.role;
    dto.isActive = user.isActive;
    return dto;
  }
}
