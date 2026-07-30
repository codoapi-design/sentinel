/**
 * Radareum Intelligence Framework — shared contracts.
 *
 * Spec: `docs/radareum-ai/05-00-intelligence-framework.md` (unified module template:
 * Goal / Questions / Metrics / Patterns / Insights / Evidence / Confidence / Output).
 *
 * Governing principle: the analytics layer computes; the LLM only explains.
 * Every engine in this directory is a pure, deterministic function that returns
 * a fully-formed `IntelligenceResult` without calling a model or the network.
 *
 * Language rules enforced by every producer of these types:
 * - Neutral description only — no advice, no predictions, no "good / bad".
 * - Never attribute an address to a person.
 * - Every insight carries numeric evidence.
 */

import type { Client, Transaction } from '@/lib/mock-data';

/** Analysis reliability, driven by data completeness and sample size. */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Observation magnitude — never a recommendation (Spec §5.73 "Severity ≠ Recommendation").
 * `high` does not mean "act"; `low` does not mean "safe".
 */
export type Severity = 'informational' | 'low' | 'medium' | 'high' | 'critical';

/** Intelligence module that produced an insight or pattern. */
export type IntelligenceCategory =
  | 'performance'
  | 'flow'
  | 'portfolio'
  | 'asset'
  | 'risk'
  | 'trading'
  | 'network'
  | 'counterparty';

/** Evidence values stay machine-readable; formatting belongs to the presentation layer. */
export type EvidenceValue = string | number;

export type Evidence = Record<string, EvidenceValue>;

/**
 * A single explainable finding. Shape follows the Insight Object defined in
 * Spec §5.7 / §5.23 / §5.41 / §5.57 / §5.74 / §5.91 / §5.108 / §5.126.
 */
export interface Insight {
  /** Deterministic id — same input always yields the same id. */
  id: string;
  /** Snake-case machine type, e.g. `concentration_risk`. */
  type: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  evidence: Evidence;
  category?: IntelligenceCategory;
  /** Consequence statement — mandatory for Risk insights (Spec §5.74). */
  impact?: string;
  /**
   * Absolute USD magnitude the insight refers to, used only for ranking.
   * `null` when the finding has no direct monetary size.
   */
  impactUsd?: number | null;
  /** Assets, networks, or counterparty display names the insight refers to. */
  relatedEntities?: string[];
}

/** A detected structural or behavioural pattern (Spec: "Patterns" section of each module). */
export interface Pattern {
  id: string;
  /** Snake-case machine type, e.g. `capital_accumulation`. */
  type: string;
  /** Human-readable pattern name as written in the Spec, e.g. "Capital Accumulation". */
  name: string;
  /** Neutral description of what the data shows. */
  description: string;
  category: IntelligenceCategory;
  confidence: Confidence;
  evidence: Evidence;
}

export type MetricUnit = 'usd' | 'pct' | 'count' | 'days' | 'score' | 'ratio';

/** A labelled scalar metric for tool output and UI tables. */
export interface MetricValue {
  key: string;
  label: string;
  /** `null` when the metric could not be derived from available data. */
  value: number | null;
  unit: MetricUnit;
  /** Optional preformatted string for surfaces that render evidence verbatim. */
  formatted?: string;
}

/** Current vs previous window for the same measure. */
export interface PeriodComparison {
  current: number;
  previous: number;
  /** `null` when the previous value is zero (percentage change is undefined). */
  changePct: number | null;
}

/**
 * Coverage of the data the analysis was built on.
 * Spec §5.67 Layer 6 — "No strong analysis on incomplete data".
 */
export interface DataQuality {
  transactionCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** 0–100 share of rows that carried a usable USD amount. */
  completeness: number;
}

/** Uniform envelope returned by every intelligence engine. */
export interface IntelligenceResult<TMetrics> {
  /** Neutral one-paragraph description of what the metrics show. */
  summary: string;
  metrics: TMetrics;
  patterns: Pattern[];
  insights: Insight[];
  confidence: Confidence;
  /** Headline numbers backing the summary. */
  evidence: Evidence;
  dataQuality: DataQuality;
}

/** Optional transaction fields present on synced rows but absent from the UI `Transaction`. */
export interface IntelligenceTransactionExtras {
  valueUsd?: number | null;
  value_usd?: number | null;
  gasFeeUsd?: number | null;
  gas_fee_usd?: number | null;
  gasFeeEth?: number | null;
  gas_fee_eth?: number | null;
  gasUsd?: number | null;
  gas_usd?: number | null;
  methodId?: string | null;
  method_id?: string | null;
  method_name?: string | null;
  protocol?: string | null;
  isSpam?: boolean | null;
  is_spam?: boolean | null;
  from?: string | null;
  to?: string | null;
  to_addr?: string | null;
  chain?: string | null;
  tokenSymbol?: string | null;
  token_symbol?: string | null;
  tokenAddress?: string | null;
  token_address?: string | null;
  tokenValue?: number | null;
  token_value?: number | null;
  priceUsd?: number | null;
  price_usd?: number | null;
  counterparty_label?: string | null;
  tx_hash?: string | null;
  hash?: string | null;
  status?: string | boolean | null;
  raw_data?: unknown;
  rawData?: unknown;
}

/**
 * Transaction accepted by the engines: the UI `Transaction` plus optional
 * sync-layer fields. Plain `Transaction[]` is assignable.
 */
export type IntelligenceTransaction = Transaction & IntelligenceTransactionExtras;

/** A current holding. Compatible with the UI `Asset` and with `asset_positions` rows. */
export interface AssetHolding {
  symbol: string;
  name?: string | null;
  quantity?: number | null;
  priceUsd?: number | null;
  valueUsd: number;
  network?: string | null;
  /** Optional externally supplied category; otherwise derived from the symbol. */
  category?: string | null;
  tokenAddress?: string | null;
  isSpam?: boolean | null;
}

/** Daily portfolio value point (matches `listPortfolioSnapshots` output). */
export interface PortfolioSnapshotPoint {
  date: string;
  value: number;
}

/**
 * Structural view of the investment-return payload the engines can consume.
 * Kept loose so `InvestmentReturnResult` and API responses both fit.
 */
export interface InvestmentReturnLike {
  returnPct?: number | null;
  totalPnlUsd?: number | null;
  unrealizedPnlUsd?: number | null;
  realizedPnlUsd?: number | null;
  costBasisOpenUsd?: number | null;
  marketValueOpenUsd?: number | null;
  trackingActive?: boolean | null;
  assets?: Array<{
    tokenSymbol: string;
    network?: string;
    totalPnlUsd?: number | null;
    unrealizedPnlUsd?: number | null;
    realizedPnlUsd?: number | null;
    marketValueOpenUsd?: number | null;
    costBasisOpenUsd?: number | null;
    returnPct?: number | null;
    status?: string | null;
    quantityOpen?: number | null;
  }>;
  sinceConnectedAt?: string | null;
  baselineValueUsd?: number | null;
  lotsCount?: number | null;
  openLotsCount?: number | null;
  methodology?: string | null;
  historySource?: string | null;
}

/** Structural view of `computeTradingVolumeDetail` output. */
export interface TradingVolumeLike {
  totalVolumeUsd?: number | null;
  tradeCount?: number | null;
  pricedTradeCount?: number | null;
  unpricedTradeCount?: number | null;
  activityPct?: number | null;
}

/** Single input contract shared by every engine. */
export interface IntelligenceInput {
  transactions: IntelligenceTransaction[];
  assets?: AssetHolding[];
  /** Custom client names — always preferred over raw addresses (Spec §5.119). */
  clients?: Client[];
  /** Authoritative portfolio value; falls back to the sum of `assets` when omitted. */
  portfolioValueUsd?: number;
  snapshots?: PortfolioSnapshotPoint[];
  investmentReturn?: unknown;
  tradingVolume?: unknown;
  /** Evaluation instant in epoch ms — pass explicitly to keep results deterministic. */
  now?: number;
  /** Analysis window length; defaults to 30 days. */
  periodDays?: number;
  /**
   * Optional human period label (e.g. `Since connected (45d)`).
   * When set, engines prefer it over the derived `Nd` label in evidence.
   */
  periodLabel?: string;
  /**
   * Narrows narrative and contributor logic for dedicated product pages.
   * Omit for general / multi-module analysis.
   */
  analysisFocus?: 'investment_return' | 'trading_volume' | 'general';
  /** Include spam / dust rows that list UIs hide. Defaults to false. */
  includeHidden?: boolean;
  /** Addresses owned by the same user — used to mark internal transfers. */
  walletAddresses?: string[];
  /** Used to convert gas from ETH when a USD fee is not stored on the row. */
  ethPriceUsd?: number | null;
}
