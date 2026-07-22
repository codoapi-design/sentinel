/** Curated palette — shared by holdings strip text + donut slices/legend */
export const NETWORK_HOLDING_COLORS = [
  '#0052ff', // portfolio blue
  '#0ecb81', // net green
  '#f6465d', // outflow red
  '#f7931a', // amber
  '#627eea', // ethereum violet
  '#8a8f98', // muted gray
  '#00d4aa', // teal
  '#2775ca', // usdc blue
  '#c99455', // warm bronze
  '#a0aec0', // cool slate
] as const;

/** Max pie slices before remainder collapses into "Other" */
export const MAX_HOLDING_DONUT_SLICES = 7;

export interface NetworkHoldingSlice {
  symbol: string;
  valueUsd: number;
  balance: number;
}

export interface ColoredHoldingSlice {
  symbol: string;
  valueUsd: number;
  color: string;
  percent: number;
}

export function holdingColorAt(index: number): string {
  return NETWORK_HOLDING_COLORS[index % NETWORK_HOLDING_COLORS.length];
}

/**
 * Live USD distribution for a network's holdings.
 * Sorts by value, assigns stable colors by rank, groups long tails as Other.
 */
export function buildNetworkHoldingsDistribution(
  holdings: Array<{ symbol: string; valueUsd: number }>,
  maxSlices: number = MAX_HOLDING_DONUT_SLICES,
): ColoredHoldingSlice[] {
  const positive = holdings
    .filter(h => (h.valueUsd || 0) > 0)
    .map(h => ({
      symbol: (h.symbol || 'Unknown').trim() || 'Unknown',
      valueUsd: h.valueUsd || 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const total = positive.reduce((s, h) => s + h.valueUsd, 0);
  if (total <= 0) return [];

  let rows: Array<{ symbol: string; valueUsd: number }>;

  if (positive.length > maxSlices) {
    const keep = Math.max(1, maxSlices - 1);
    const top = positive.slice(0, keep);
    const otherUsd = positive
      .slice(keep)
      .reduce((s, h) => s + h.valueUsd, 0);
    rows = [...top, { symbol: 'Other', valueUsd: otherUsd }];
  } else {
    rows = positive;
  }

  return rows.map((row, i) => ({
    symbol: row.symbol,
    valueUsd: row.valueUsd,
    color: holdingColorAt(i),
    percent: (row.valueUsd / total) * 100,
  }));
}

/** Compact USD for the holdings strip chip line — `$1.5k`, `$2.3M`, `$999` */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const n = abs / 1_000_000;
    const body = n >= 10 ? n.toFixed(1) : n.toFixed(1);
    return `$${trimTrailingZero(body)}M`;
  }

  if (abs >= 1_000) {
    const n = abs / 1_000;
    return `$${trimTrailingZero(n.toFixed(1))}k`;
  }

  if (abs >= 100) {
    return `$${Math.round(abs)}`;
  }

  if (abs >= 10) {
    return `$${abs.toFixed(0)}`;
  }

  if (abs >= 1) {
    return `$${abs.toFixed(2)}`;
  }

  return `$${abs.toFixed(2)}`;
}

function trimTrailingZero(s: string): string {
  return s.replace(/\.0$/, '');
}
