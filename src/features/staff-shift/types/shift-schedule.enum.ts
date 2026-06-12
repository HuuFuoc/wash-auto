/**
 * Request-level shift selection a manager picks when creating shifts.
 * `FULLDAY` is expanded server-side into the two stored {@link ShiftBlockEnum}
 * blocks (morning + afternoon) - it is never persisted as a block itself.
 */
export enum ShiftScheduleEnum {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  FULLDAY = 'fullday',
}
