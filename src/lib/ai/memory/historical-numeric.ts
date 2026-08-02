/**
 * Temporal numeric validation helpers for Package 3.
 */

export type TemporalTag = 'current' | 'historical' | 'delta';

export interface TemporalNumericValue {
  value: number;
  unit?: 'usd' | 'pct' | 'pp' | 'count' | 'other';
  temporal: TemporalTag;
  asOf?: string;
  analysisId?: string;
  labels?: string[];
}

export interface HistoricalNumericCheck {
  valid: boolean;
  failures: string[];
}

export function validateCurrentVsHistorical(input: {
  current: TemporalNumericValue;
  historical: TemporalNumericValue;
  claimedCurrent?: number;
  claimedHistorical?: number;
  claimedDeltaPp?: number;
}): HistoricalNumericCheck {
  const failures: string[] = [];
  if (input.current.temporal !== 'current') failures.push('current_tag_invalid');
  if (input.historical.temporal !== 'historical') failures.push('historical_tag_invalid');

  if (input.claimedCurrent != null && Math.abs(input.claimedCurrent - input.current.value) > 0.15) {
    failures.push('current_mismatch');
  }
  if (
    input.claimedHistorical != null &&
    Math.abs(input.claimedHistorical - input.historical.value) > 0.15
  ) {
    failures.push('historical_mismatch');
  }

  // Swapped detection
  if (
    input.claimedCurrent != null &&
    input.claimedHistorical != null &&
    Math.abs(input.claimedCurrent - input.historical.value) <= 0.15 &&
    Math.abs(input.claimedHistorical - input.current.value) <= 0.15 &&
    Math.abs(input.current.value - input.historical.value) > 0.15
  ) {
    failures.push('swapped_current_historical');
  }

  if (input.claimedDeltaPp != null) {
    const expected = input.current.value - input.historical.value;
    if (Math.abs(input.claimedDeltaPp - expected) > 0.2) {
      failures.push('delta_pp_mismatch');
    }
    if (Math.sign(input.claimedDeltaPp) !== Math.sign(expected) && expected !== 0) {
      failures.push('sign_inversion');
    }
  }

  if (
    input.historical.asOf &&
    input.current.asOf &&
    input.historical.asOf === input.current.asOf &&
    Math.abs(input.current.value - input.historical.value) > 0.15
  ) {
    // same timestamp with different values is suspicious for distinct periods
    failures.push('wrong_date_association');
  }

  return { valid: failures.length === 0, failures };
}
