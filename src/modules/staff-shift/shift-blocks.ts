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

/**
 * Inclusive list of VN calendar dates (YYYY-MM-DD) from `from` to `to`. Works on
 * UTC midnight ticks so it never drifts across DST/timezone (VN has no DST, but
 * the arithmetic stays timezone-free regardless).
 */
export function enumerateDates(from: string, to: string): string[] {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    throw new BadRequestException('date must be in YYYY-MM-DD format');
  }
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  const dates: string[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${d.getUTCFullYear()}-${mm}-${dd}`);
  }
  return dates;
}

/**
 * ISO-8601 weekday of a VN calendar date: Monday = 1 … Sunday = 7. Only the
 * calendar date matters (not the wall-clock hour), so plain UTC is correct here.
 */
export function isoWeekday(date: string): number {
  if (!DATE_RE.test(date)) {
    throw new BadRequestException('date must be in YYYY-MM-DD format');
  }
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

/** Two half-open time intervals overlap iff each starts before the other ends. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
