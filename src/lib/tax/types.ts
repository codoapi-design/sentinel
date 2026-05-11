/**
 * Tax Analysis System Types — CryptoBooks Enterprise
 *
 * Defines all types used in the tax calculation engine.
 * Includes: tax lots, gains/losses, and tax reports.
 */

// ============================================================
// Tax Method and Classification Types
// ============================================================

/** Tax lot calculation method: First In First Out (FIFO) or Last In First Out (LIFO) */
export type TaxLotMethod = 'fifo' | 'lifo';

/** Holding period: short-term (< 1 year) or long-term (>= 1 year) */
export type HoldingPeriod = 'short_term' | 'long_term';

/** Gain/loss type */
export type GainLossType = 'realized_gain' | 'realized_loss' | 'unrealized_gain' | 'unrealized_loss';

// ============================================================
// Tax Data Interfaces
// ============================================================

/**
 * Tax Lot
 * Represents a specific digital asset acquisition/purchase
 */
export interface TaxLot {
  /** Unique identifier */
  id: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Acquisition date */
  acquisitionDate: string;
  /** Acquisition price per unit in USD */
  acquisitionPrice: number;
  /** Acquired quantity */
  quantity: number;
  /** Remaining quantity (after partial disposal) */
  remainingQuantity: number;
  /** Network */
  network: string;
  /** Transaction hash */
  txHash: string;
}

/**
 * Gain/Loss Entry
 * Documents each disposal with gain or loss calculation
 */
export interface GainLossEntry {
  /** Unique identifier */
  id: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Disposal date */
  disposalDate: string;
  /** Disposal price per unit in USD */
  disposalPrice: number;
  /** Disposed quantity */
  quantity: number;
  /** Cost basis (total acquisition cost) */
  costBasis: number;
  /** Disposal proceeds */
  proceeds: number;
  /** Gain or loss */
  gainLoss: number;
  /** Gain/loss percentage */
  gainLossPercentage: number;
  /** Holding period */
  holdingPeriod: HoldingPeriod;
  /** Acquisition date */
  acquisitionDate: string;
  /** Calculation method used */
  method: TaxLotMethod;
  /** Network */
  network: string;
  /** Purchase transaction hash */
  buyTxHash: string;
  /** Sale transaction hash */
  sellTxHash: string;
}

/**
 * Tax Summary
 * Comprehensive statistics for realized and unrealized gains/losses
 */
export interface TaxSummary {
  /** Total realized gains */
  totalRealizedGains: number;
  /** Total realized losses */
  totalRealizedLosses: number;
  /** Net realized gain/loss */
  netRealizedGainLoss: number;
  /** Short-term gains */
  shortTermGains: number;
  /** Short-term losses */
  shortTermLosses: number;
  /** Long-term gains */
  longTermGains: number;
  /** Long-term losses */
  longTermLosses: number;
  /** Total transactions */
  totalTransactions: number;
  /** Number of taxable events */
  taxableEvents: number;
  /** Unrealized gains */
  unrealizedGains: number;
  /** Unrealized losses */
  unrealizedLosses: number;
  /** Total cost basis */
  costBasisTotal: number;
  /** Total current value */
  currentValueTotal: number;
}

/**
 * Annual Tax Report
 * Includes summary, gain/loss entries, and remaining tax lots
 */
export interface TaxReport {
  /** Unique identifier */
  id: string;
  /** Fiscal year */
  year: number;
  /** Tax lot calculation method */
  method: TaxLotMethod;
  /** Tax summary */
  summary: TaxSummary;
  /** Gain and loss entries */
  gainLossEntries: GainLossEntry[];
  /** Remaining tax lots */
  taxLots: TaxLot[];
  /** Report generation date */
  generatedAt: string;
}
