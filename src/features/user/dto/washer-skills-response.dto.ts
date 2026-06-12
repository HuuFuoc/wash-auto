import { ApiProperty } from '@nestjs/swagger';
import { UserDocument } from '../../auth/entities/user.entity';

class WasherSkillItemDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  serviceTypeId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f9' })
  vehicleTypeId: string;
}

/** Response for the washer-skills endpoints. */
export class WasherSkillsResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f0' })
  userId: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  name: string;

  @ApiProperty({ type: [WasherSkillItemDto] })
  skills: WasherSkillItemDto[];

  static fromDocument(user: UserDocument): WasherSkillsResponseDto {
    const dto = new WasherSkillsResponseDto();
    dto.userId = user._id.toString();
    dto.name = user.name;
    dto.skills = (user.washer_skills ?? []).map((s) => ({
      serviceTypeId: s.service_type_id.toString(),
      vehicleTypeId: s.vehicle_type_id.toString(),
    }));
    return dto;
  }
}
