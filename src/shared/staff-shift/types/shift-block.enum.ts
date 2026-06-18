/**
 * Fixed working-time blocks a shift may occupy. Replaces arbitrary start/end
 * times so every shift lines up with the shop's office hours (and therefore
 * with the bookable-slot windows in order.service).
 */
export enum ShiftBlockEnum {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
}
