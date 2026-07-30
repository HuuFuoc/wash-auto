/**
 * Vietnam-local (UTC+7) rendering of an instant, for user-facing text and for
 * the day-bucketing the realtime slot feed broadcasts.
 *
 * Shifting by a fixed offset is correct here and not a shortcut: Vietnam has no
 * daylight saving, so ICT is UTC+7 year round. Keeping both formatters in one
 * place stops the offset from being retyped (and mistyped) per module.
 */
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `2026-07-30` — the Vietnam-local calendar date an instant falls on. */
export function vnDateOf(at: Date): string {
  return new Date(at.getTime() + VN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** `2026-07-30 14:30` in Vietnam local time. */
export function vnDateTimeOf(at: Date): string {
  const shifted = new Date(at.getTime() + VN_UTC_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}
