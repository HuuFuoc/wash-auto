import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
  @ApiProperty({
    example: 'b3c7e0f4-9e6e-4c2d-aab2-08d3c1c0b1a2',
    description: 'Id phiên hội thoại — lưu lại để gửi kèm ở lần chat sau',
  })
  sessionId: string;

  @ApiProperty({
    example:
      'Cửa hàng đang có 3 gói: Rửa cơ bản (50.000đ, 20 phút), Premium (80.000đ, 30 phút), Detailing (200.000đ, 90 phút).',
    description: 'Câu trả lời của bot',
  })
  reply: string;

  @ApiProperty({
    example: ['list_services'],
    description: 'Danh sách tool bot đã gọi để tổng hợp câu trả lời',
    type: [String],
  })
  toolsCalled: string[];
}
