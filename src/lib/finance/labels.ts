/**
 * User-facing cash-flow summary labels.
 * Internal keys (`revenue` / `expenses`) and classification types
 * (`income` / `expense`) stay unchanged — only display strings.
 */
export const SUMMARY_INFLOW = 'Inflow';
export const SUMMARY_OUTFLOW = 'Outflow';

export const SUMMARY_TOTAL_INFLOW = 'Total Inflow';
export const SUMMARY_TOTAL_OUTFLOW = 'Total Outflow';

/** Section id → display title for dashboard / nav headers */
export function summarySectionTitle(
  section: 'revenue' | 'expenses' | 'flow' | 'gas' | string,
): string {
  switch (section) {
    case 'revenue':
      return SUMMARY_INFLOW;
    case 'expenses':
      return SUMMARY_OUTFLOW;
    case 'flow':
      return 'Net Flow';
    case 'gas':
      return 'Gas Fees';
    default:
      return section;
  }
}
