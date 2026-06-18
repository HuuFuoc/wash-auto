import { BadRequestException } from '../../common/exceptions';
import { ShiftBlockEnum } from '../../shared/staff-shift/types/shift-block.enum';
import { ShiftScheduleEnum } from '../../shared/staff-shift/types/shift-schedule.enum';

const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Office-hour blocks in Vietnam local time, as [openHour, closeHour]. MUST stay
 * in sync with `BUSINESS_HOUR_WINDOWS` in order.service.ts.
 */
export const SHIFT_BLOCK_HOURS: Record<
  ShiftBlockEnum,
  { startHour: number; endHour: number }
> = {
  [ShiftBlockEnum.MORNING]: { startHour: 8, endHour: 12 },
  [ShiftBlockEnum.AFTERNOON]: { startHour: 14, endHour: 17 },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves the absolute UTC [startAt, endAt] of a block on a given VN calendar
 * date (YYYY-MM-DD). VN local hour H on that date is `Date.UTC(...,H) - 7h`.
 */
export function resolveShiftBlock(
  date: string,
  block: ShiftBlockEnum,
): { startAt: Date; endAt: Date } {
  if (!DATE_RE.test(date)) {
    throw new BadRequestException('date must be in YYYY-MM-DD format');
  }
  const hours = SHIFT_BLOCK_HOURS[block];
  if (!hours) {
    throw new BadRequestException('Invalid shift block');
  }
  const [y, m, d] = date.split('-').map(Number);
  const startAt = new Date(
    Date.UTC(y, m - 1, d, hours.startHour, 0, 0, 0) - VN_UTC_OFFSET_MS,
  );
  const endAt = new Date(
    Date.UTC(y, m - 1, d, hours.endHour, 0, 0, 0) - VN_UTC_OFFSET_MS,
  );
  return { startAt, endAt };
}

/**
 * Expands a manager's shift selection into the concrete blocks to create.
 * `FULLDAY` becomes [morning, afternoon] - two separate shift records.
 */
export function expandSchedule(schedule: ShiftScheduleEnum): ShiftBlockEnum[] {
  switch (schedule) {
    case ShiftScheduleEnum.MORNING:
      return [ShiftBlockEnum.MORNING];
    case ShiftScheduleEnum.AFTERNOON:
      return [ShiftBlockEnum.AFTERNOON];
    case ShiftScheduleEnum.FULLDAY:
      return [ShiftBlockEnum.MORNING, ShiftBlockEnum.AFTERNOON];
  }
}
