import { BookingStatusEnum } from './types/booking-status.enum';

const TRANSITIONS: Record<BookingStatusEnum, BookingStatusEnum[]> = {
  [BookingStatusEnum.PENDING]: [
    BookingStatusEnum.CONFIRMED,
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.NO_SHOW,
  ],
  [BookingStatusEnum.CONFIRMED]: [
    BookingStatusEnum.IN_PROGRESS,
    BookingStatusEnum.CANCELLED,
    BookingStatusEnum.NO_SHOW,
  ],
  [BookingStatusEnum.IN_PROGRESS]: [BookingStatusEnum.DONE],
  [BookingStatusEnum.DONE]: [],
  [BookingStatusEnum.CANCELLED]: [],
  [BookingStatusEnum.NO_SHOW]: [],
};

export function isValidBookingTransition(
  from: BookingStatusEnum,
  to: BookingStatusEnum,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Customer can only cancel from PENDING or CONFIRMED.
 * Status transitions IN_PROGRESS / DONE / NO_SHOW are staff-driven.
 */
export function isCancellableByOwner(status: BookingStatusEnum): boolean {
  return (
    status === BookingStatusEnum.PENDING ||
    status === BookingStatusEnum.CONFIRMED
  );
}

/** Statuses that consume a shift capacity slot (need rollback on transition out). */
export function consumesShiftCapacity(status: BookingStatusEnum): boolean {
  return (
    status === BookingStatusEnum.PENDING ||
    status === BookingStatusEnum.CONFIRMED ||
    status === BookingStatusEnum.IN_PROGRESS
  );
}
