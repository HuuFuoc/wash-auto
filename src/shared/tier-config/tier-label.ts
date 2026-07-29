import { TierNameEnum } from './types/tier-name.enum';

/**
 * Tên hạng hiển thị cho khách.
 *
 * `TierNameEnum` là giá trị lưu trong DB ('None' | 'Bronze' | ...) — tiện cho
 * code, nhưng lọt ra thông báo tiếng Việt thì thành "Chúc mừng! Bạn đã lên hạng
 * Bronze", và tệ hơn là "hạng None", thứ không có nghĩa gì với người đọc.
 *
 * Bảng chữ này khớp `constants/tiers.ts` bên FE. Đổi tên hạng thì phải sửa cả
 * hai nơi.
 */
const TIER_LABELS: Record<string, string> = {
  [TierNameEnum.NONE]: 'Thành viên',
  [TierNameEnum.BRONZE]: 'Đồng',
  [TierNameEnum.SILVER]: 'Bạc',
  [TierNameEnum.GOLD]: 'Vàng',
};

export function tierLabel(tierName?: string | null): string {
  if (!tierName) return TIER_LABELS[TierNameEnum.NONE];
  return TIER_LABELS[tierName] ?? tierName;
}
