/** One washer's aggregated stats for the shift/performance tab. */
export interface StaffPerformanceRow {
  washerId: string;
  name: string;
  /** Working status (active account vs. deactivated). */
  isActive: boolean;
  /** Shifts in the selected window (all-time if no window). */
  shiftsCount: number;
  /** Work orders finished (DONE) — "số xe đã rửa". */
  carsWashed: number;
  /** Work orders assigned/handled — "số đơn đã xử lý". */
  ordersHandled: number;
  /** Number of customer feedbacks received. */
  feedbackCount: number;
  /** Mean customer rating (0 when no feedback). */
  averageRating: number;
}
