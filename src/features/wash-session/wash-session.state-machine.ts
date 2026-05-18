import { WashSessionStatusEnum } from './types/wash-session-status.enum';

const TRANSITIONS: Record<WashSessionStatusEnum, WashSessionStatusEnum[]> = {
  [WashSessionStatusEnum.WAITING]: [
    WashSessionStatusEnum.ASSIGNED,
    WashSessionStatusEnum.CANCELLED,
  ],
  [WashSessionStatusEnum.ASSIGNED]: [
    WashSessionStatusEnum.IN_PROGRESS,
    WashSessionStatusEnum.WAITING, // un-assign
    WashSessionStatusEnum.CANCELLED,
  ],
  [WashSessionStatusEnum.IN_PROGRESS]: [
    WashSessionStatusEnum.DONE,
    WashSessionStatusEnum.CANCELLED,
  ],
  [WashSessionStatusEnum.DONE]: [],
  [WashSessionStatusEnum.CANCELLED]: [],
};

export function isValidWashSessionTransition(
  from: WashSessionStatusEnum,
  to: WashSessionStatusEnum,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}
