import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Cho tôi xem danh sách dịch vụ rửa xe đang có',
    description: 'Tin nhắn của người dùng (1-1000 ký tự)',
    maxLength: 1000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({
    example: 'b3c7e0f4-9e6e-4c2d-aab2-08d3c1c0b1a2',
    description:
      'Id phiên hội thoại để tiếp tục lịch sử. Bỏ trống nếu bắt đầu phiên mới - server sẽ trả về sessionId trong response.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}
