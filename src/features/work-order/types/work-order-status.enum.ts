export enum WorkOrderStatusEnum {
  /** Just created at check-in, no washer assigned yet. */
  WAITING = 'waiting',
  /** A washer has been assigned, work not started. */
  ASSIGNED = 'assigned',
  /** Washer is performing the wash. */
  IN_PROGRESS = 'in_progress',
  /** Washer finished, awaiting quality check. */
  QUALITY_CHECK = 'quality_check',
  /** QC rejected — sent back to the washer to redo. */
  RETURNED = 'returned',
  /** QC passed. Terminal. */
  DONE = 'done',
}
