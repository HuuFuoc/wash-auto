export enum WorkOrderStatusEnum {
  /** Just created at check-in, no washer assigned yet. */
  WAITING = 'waiting',
  /** A washer has been assigned, work not started. */
  ASSIGNED = 'assigned',
  /** Washer is performing the wash. */
  IN_PROGRESS = 'in_progress',
  /** Washer finished the wash. Terminal (manager QC removed). */
  DONE = 'done',
}
