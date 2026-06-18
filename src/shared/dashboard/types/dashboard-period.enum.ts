/**
 * Preset reporting windows the dashboard supports. The backend treats
 * `period` as an echo/label hint only - the actual filtering is driven by the
 * resolved `fromDate`/`toDate` (VN day boundaries). The FE computes the
 * concrete dates for each preset so the two never disagree.
 */
export enum DashboardPeriodEnum {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  WEEK = 'week',
  LAST_7 = 'last7',
  LAST_30 = 'last30',
  MONTH = 'month',
  LAST_MONTH = 'lastMonth',
  QUARTER = 'quarter',
  LAST_QUARTER = 'lastQuarter',
  YEAR = 'year',
  LAST_YEAR = 'lastYear',
  CUSTOM = 'custom',
}
