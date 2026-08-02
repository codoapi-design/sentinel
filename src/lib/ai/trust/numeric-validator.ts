/**
 * Numeric consistency validator — every stated number must match approved metrics/evidence.
 */

import type { NarrativeValidationReport } from './types';

export interface ApprovedNumericValue {
  value: number;
  /** Optional labels that help asset attribution, e.g. "SOL", "portfolio". */
  labels?: string[];
  unit?: 'usd' | 'pct' | 'count' | 'qty' | 'other';
}

export interface ValidateNarrativeArgs {
  texts: string[];
  approved: ApprovedNumericValue[];
  /** Absolute tolerance for USD amounts. */
  usdAbsTolerance?: number;
  /** Relative tolerance for USD amounts. */
  usdRelTolerance?: number;
  /** Absolute tolerance for percentage points (e.g. 0.6 means ±0.6pp). */
  pctAbsTolerance?: number;
}

const DEFAULT_USD_ABS = 0.51;
const DEFAULT_USD_REL = 0.005;
const DEFAULT_PCT_ABS = 0.6;

interface ExtractedClaim {
  text: string;
  value: number;
  kind: 'usd' | 'pct' | 'plain';
  sign: 1 | -1;
  nearby: string;
}

export function extractNumericClaims(text: string): ExtractedClaim[] {
  const claims: ExtractedClaim[] = [];
  if (!text) return claims;

  // Currencies: $1,234.56 | -$12 | USD 12.3 | 1.2k / 1.2m with $
  const currencyRe =
    /(?<![A-Za-z0-9_])(-?\$|\$|USD\s*)(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(\s*[kKmMbB])?/g;
  for (const match of text.matchAll(currencyRe)) {
    const rawNum = match[2] ?? '';
    const suffix = (match[3] ?? '').trim().toLowerCase();
    let value = Number.parseFloat(rawNum.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (suffix === 'k') value *= 1_000;
    else if (suffix === 'm') value *= 1_000_000;
    else if (suffix === 'b') value *= 1_000_000_000;
    const prefix = match[1] ?? '';
    const negative = prefix.includes('-') || value < 0;
    value = Math.abs(value);
    const idx = match.index ?? 0;
    claims.push({
      text: match[0],
      value: negative ? -value : value,
      kind: 'usd',
      sign: negative ? -1 : 1,
      nearby: text.slice(Math.max(0, idx - 24), Math.min(text.length, idx + match[0].length + 24)),
    });
  }

  // Percentages: 12.5% | -3%
  const pctRe = /(?<![A-Za-z0-9_])(-?\d+(?:\.\d+)?)\s*%/g;
  for (const match of text.matchAll(pctRe)) {
    const value = Number.parseFloat(match[1] ?? '');
    if (!Number.isFinite(value)) continue;
    const idx = match.index ?? 0;
    claims.push({
      text: match[0],
      value,
      kind: 'pct',
      sign: value < 0 ? -1 : 1,
      nearby: text.slice(Math.max(0, idx - 24), Math.min(text.length, idx + match[0].length + 24)),
    });
  }

  return claims;
}

function roughlyEqual(
  a: number,
  b: number,
  absTol: number,
  relTol: number,
): boolean {
  const abs = Math.abs(a - b);
  if (abs <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return abs / scale <= relTol;
}

function matchClaim(
  claim: ExtractedClaim,
  approved: ApprovedNumericValue[],
  opts: Required<Pick<ValidateNarrativeArgs, 'usdAbsTolerance' | 'usdRelTolerance' | 'pctAbsTolerance'>>,
): boolean {
  for (const a of approved) {
    if (claim.kind === 'usd') {
      if (a.unit && a.unit !== 'usd' && a.unit !== 'other') continue;
      // Sign inversion check
      if (Math.sign(claim.value) !== 0 && Math.sign(a.value) !== 0 && Math.sign(claim.value) !== Math.sign(a.value)) {
        // Allow if absolute matches but we'll reject sign inversion separately
        if (roughlyEqual(Math.abs(claim.value), Math.abs(a.value), opts.usdAbsTolerance, opts.usdRelTolerance)) {
          return false; // sign inversion — caller treats as unmatched with reason
        }
        continue;
      }
      if (roughlyEqual(claim.value, a.value, opts.usdAbsTolerance, opts.usdRelTolerance)) {
        // Asset attribution: if nearby mentions a symbol label on another approved value, prefer consistency
        return true;
      }
    } else if (claim.kind === 'pct') {
      if (a.unit && a.unit !== 'pct' && a.unit !== 'other') continue;
      if (Math.abs(claim.value - a.value) <= opts.pctAbsTolerance) return true;
    }
  }
  return false;
}

function signInversion(
  claim: ExtractedClaim,
  approved: ApprovedNumericValue[],
  opts: Required<Pick<ValidateNarrativeArgs, 'usdAbsTolerance' | 'usdRelTolerance'>>,
): boolean {
  if (claim.kind !== 'usd') return false;
  for (const a of approved) {
    if (a.unit && a.unit !== 'usd' && a.unit !== 'other') continue;
    if (
      Math.sign(claim.value) !== Math.sign(a.value) &&
      roughlyEqual(Math.abs(claim.value), Math.abs(a.value), opts.usdAbsTolerance, opts.usdRelTolerance)
    ) {
      return true;
    }
  }
  return false;
}

export function validateNarrativeAgainstIntelligence(
  args: ValidateNarrativeArgs,
): NarrativeValidationReport {
  const opts = {
    usdAbsTolerance: args.usdAbsTolerance ?? DEFAULT_USD_ABS,
    usdRelTolerance: args.usdRelTolerance ?? DEFAULT_USD_REL,
    pctAbsTolerance: args.pctAbsTolerance ?? DEFAULT_PCT_ABS,
  };

  const unmatched: NarrativeValidationReport['unmatchedClaims'] = [];
  let checked = 0;
  let matched = 0;

  for (const text of args.texts) {
    for (const claim of extractNumericClaims(text)) {
      checked += 1;
      if (signInversion(claim, args.approved, opts)) {
        unmatched.push({
          text: claim.text,
          normalizedValue: claim.value,
          reason: 'Sign inversion relative to approved metric.',
        });
        continue;
      }
      if (matchClaim(claim, args.approved, opts)) {
        matched += 1;
      } else {
        unmatched.push({
          text: claim.text,
          normalizedValue: claim.value,
          reason:
            claim.kind === 'pct'
              ? 'Percentage not found in approved metrics within tolerance.'
              : 'Financial amount not found in approved metrics/evidence.',
        });
      }
    }
  }

  return {
    valid: unmatched.length === 0,
    checkedClaims: checked,
    matchedClaims: matched,
    unmatchedClaims: unmatched,
    correctionsApplied: [],
  };
}

/**
 * Constrained repair: strip sentences containing unmatched claims.
 * Does not invent new numbers.
 */
export function repairNarrativeText(
  text: string,
  report: NarrativeValidationReport,
): { text: string; correctionsApplied: string[] } {
  if (report.valid || report.unmatchedClaims.length === 0) {
    return { text, correctionsApplied: [] };
  }

  const corrections: string[] = [];
  let next = text;
  for (const claim of report.unmatchedClaims) {
    // Remove the sentence containing the bad claim when possible.
    const escaped = claim.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sentenceRe = new RegExp(`[^.!?\\n]*${escaped}[^.!?\\n]*[.!?]?`, 'g');
    const before = next;
    next = next.replace(sentenceRe, '').replace(/\n{3,}/g, '\n\n').trim();
    if (next !== before) {
      corrections.push(`Removed sentence containing unverified claim ${claim.text}`);
    }
  }

  return { text: next, correctionsApplied: corrections };
}

/** Collect approved numbers from metrics + evidence maps. */
export function collectApprovedNumerics(input: {
  metrics?: Array<{ value: unknown; key?: string; label?: string; unit?: string }>;
  evidenceValues?: unknown[];
  portfolioValueUsd?: number;
}): ApprovedNumericValue[] {
  const out: ApprovedNumericValue[] = [];

  const push = (value: unknown, labels: string[], unit?: ApprovedNumericValue['unit']) => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
    if (!Number.isFinite(n)) return;
    out.push({ value: n, labels, unit });
  };

  if (input.portfolioValueUsd != null) {
    push(input.portfolioValueUsd, ['portfolio', 'total'], 'usd');
  }

  for (const m of input.metrics ?? []) {
    const unitRaw = (m.unit ?? '').toLowerCase();
    let unit: ApprovedNumericValue['unit'] = 'other';
    if (unitRaw.includes('usd') || unitRaw === 'currency' || unitRaw === '$') unit = 'usd';
    else if (unitRaw.includes('pct') || unitRaw.includes('percent')) unit = 'pct';
    else if (unitRaw.includes('count')) unit = 'count';
    push(m.value, [m.key ?? '', m.label ?? ''].filter(Boolean), unit);

    // Also accept percent-as-fraction * 100 variants for common allocation metrics
    if (unit === 'pct' && typeof m.value === 'number' && Math.abs(m.value) <= 1) {
      push(m.value * 100, [m.key ?? '', m.label ?? ''], 'pct');
    }
  }

  for (const ev of input.evidenceValues ?? []) {
    if (typeof ev === 'number') push(ev, [], 'other');
    else if (ev && typeof ev === 'object' && 'value' in (ev as object)) {
      push((ev as { value: unknown }).value, [], 'other');
    }
  }

  return out;
}
