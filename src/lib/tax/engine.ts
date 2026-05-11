/**
 * Tax Calculation Engine — CryptoBooks Enterprise
 *
 * Implements tax report calculation using FIFO and LIFO methods.
 * Tracks tax lots and calculates realized and unrealized
 * gains/losses with holding period determination.
 */

import type { Transaction } from '@/lib/mock-data';
import type {
  TaxLotMethod,
  TaxLot,
  GainLossEntry,
  TaxSummary,
  TaxReport,
  HoldingPeriod,
} from './types';

// ============================================================
// Constants
// ============================================================

/** Number of days in a year for holding period determination */
const DAYS_IN_YEAR = 365;

/** Threshold for long-term holding period */
const LONG_TERM_THRESHOLD_DAYS = DAYS_IN_YEAR;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Generate a unique identifier
 * @param prefix The prefix
 */
function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now().toString(36);
  return `${prefix}${timestamp}${random}`;
}

/**
 * Calculate the number of days between two dates
 * @param startDate Start date
 * @param endDate End date
 * @returns Number of days
 */
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine holding period based on holding duration
 * @param acquisitionDate Acquisition date
 * @param disposalDate Disposal date
 * @returns Holding period
 */
function determineHoldingPeriod(
  acquisitionDate: string,
  disposalDate: string,
): HoldingPeriod {
  const days = daysBetween(acquisitionDate, disposalDate);
  return days >= LONG_TERM_THRESHOLD_DAYS ? 'long_term' : 'short_term';
}

// ============================================================
// Main Function: Calculate Tax Report
// ============================================================

/**
 * Calculate a complete tax report based on transactions
 *
 * @param transactions List of transactions from wallet store
 * @param method Tax lot calculation method (FIFO or LIFO)
 * @param year Fiscal year
 * @returns Comprehensive tax report
 */
export function calculateTaxReport(
  transactions: Transaction[],
  method: TaxLotMethod,
  year: number,
): TaxReport {
  // Filter transactions by year
  const yearTransactions = transactions.filter(tx => {
    const txYear = new Date(tx.date).getFullYear();
    return txYear === year;
  });

  // Sort transactions chronologically (ascending)
  const sortedTransactions = [...yearTransactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Maps to track tax lots per token
  const taxLotsMap = new Map<string, TaxLot[]>();
  // Gain/loss entries
  const gainLossEntries: GainLossEntry[] = [];
  // Taxable event counter
  let taxableEvents = 0;

  // ============================================================
  // Process each transaction
  // ============================================================

  for (const tx of sortedTransactions) {
    const token = tx.token;

    // Get or create token lot list
    if (!taxLotsMap.has(token)) {
      taxLotsMap.set(token, []);
    }
    const lots = taxLotsMap.get(token)!;

    if (tx.type === 'income' || tx.type === 'staking') {
      // ─── Acquisition: Create a new tax lot ───
      const newLot: TaxLot = {
        id: generateId('lot-'),
        tokenSymbol: token,
        acquisitionDate: tx.date,
        acquisitionPrice: tx.price,
        quantity: tx.quantity,
        remainingQuantity: tx.quantity,
        network: tx.network,
        txHash: tx.txHash,
      };
      lots.push(newLot);
    } else if (tx.type === 'trade') {
      // ─── Trade: may mean sale (disposal) and purchase (acquisition) ───
      // In our model, a single transaction represents one side
      // If the value is negative or zero → disposal, otherwise → acquisition
      // Simple approach: assume trade always involves one-sided disposal
      // But in our data, trades are recorded as a single value

      // Consider trade as acquisition if quantity is positive
      // This depends on data interpretation
      // Create a new lot for the trade
      const newLot: TaxLot = {
        id: generateId('lot-'),
        tokenSymbol: token,
        acquisitionDate: tx.date,
        acquisitionPrice: tx.price,
        quantity: tx.quantity,
        remainingQuantity: tx.quantity,
        network: tx.network,
        txHash: tx.txHash,
      };
      lots.push(newLot);
    } else if (tx.type === 'expense' || tx.type === 'gas') {
      // ─── Expense or gas: dispose of lots ───
      if (tx.type === 'expense') {
        taxableEvents++;

        // Disposal quantity
        let remainingToDispose = tx.quantity;

        // Dispose from lots according to method (FIFO or LIFO)
        while (remainingToDispose > 0 && lots.length > 0) {
          // Select the appropriate lot
          const lotIndex = method === 'fifo' ? 0 : lots.length - 1;
          const lot = lots[lotIndex];

          if (!lot || lot.remainingQuantity <= 0) {
            // Remove exhausted lot
            lots.splice(lotIndex, 1);
            continue;
          }

          // Disposed quantity from this lot
          const disposeQuantity = Math.min(remainingToDispose, lot.remainingQuantity);

          // Calculate gain/loss
          const costBasis = disposeQuantity * lot.acquisitionPrice;
          const proceeds = disposeQuantity * tx.price;
          const gainLoss = proceeds - costBasis;
          const gainLossPercentage = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

          // Determine holding period
          const holdingPeriod = determineHoldingPeriod(lot.acquisitionDate, tx.date);

          // Create gain/loss entry
          const entry: GainLossEntry = {
            id: generateId('gl-'),
            tokenSymbol: token,
            disposalDate: tx.date,
            disposalPrice: tx.price,
            quantity: disposeQuantity,
            costBasis: Math.round(costBasis * 100) / 100,
            proceeds: Math.round(proceeds * 100) / 100,
            gainLoss: Math.round(gainLoss * 100) / 100,
            gainLossPercentage: Math.round(gainLossPercentage * 100) / 100,
            holdingPeriod,
            acquisitionDate: lot.acquisitionDate,
            method,
            network: tx.network,
            buyTxHash: lot.txHash,
            sellTxHash: tx.txHash,
          };

          gainLossEntries.push(entry);

          // Update the lot
          lot.remainingQuantity -= disposeQuantity;
          remainingToDispose -= disposeQuantity;

          // Remove lot if fully exhausted
          if (lot.remainingQuantity <= 0) {
            lots.splice(lotIndex, 1);
          }
        }

        // If remaining quantity is uncovered (insufficient lots)
        if (remainingToDispose > 0) {
          // Record loss without cost basis (exception)
          const proceeds = remainingToDispose * tx.price;
          const entry: GainLossEntry = {
            id: generateId('gl-'),
            tokenSymbol: token,
            disposalDate: tx.date,
            disposalPrice: tx.price,
            quantity: remainingToDispose,
            costBasis: 0,
            proceeds: Math.round(proceeds * 100) / 100,
            gainLoss: Math.round(proceeds * 100) / 100,
            gainLossPercentage: 100,
            holdingPeriod: 'short_term',
            acquisitionDate: tx.date,
            method,
            network: tx.network,
            buyTxHash: 'unknown',
            sellTxHash: tx.txHash,
          };
          gainLossEntries.push(entry);
        }
      }
      // Gas expenses are not considered separate taxable events
    }
    // DeFi transactions are treated as exceptions — their tax impact is not calculated automatically
  }

  // ============================================================
  // Aggregate remaining lots
  // ============================================================

  const remainingLots: TaxLot[] = [];
  for (const [, lots] of taxLotsMap) {
    remainingLots.push(...lots.filter(lot => lot.remainingQuantity > 0));
  }

  // ============================================================
  // Calculate unrealized gains for remaining lots
  // ============================================================

  // Get current prices from latest transactions
  const currentPrices = new Map<string, number>();
  for (const tx of sortedTransactions) {
    currentPrices.set(tx.token, tx.price);
  }

  let unrealizedGains = 0;
  let unrealizedLosses = 0;
  let costBasisTotal = 0;
  let currentValueTotal = 0;

  for (const lot of remainingLots) {
    const currentPrice = currentPrices.get(lot.tokenSymbol) || lot.acquisitionPrice;
    const lotCostBasis = lot.remainingQuantity * lot.acquisitionPrice;
    const lotCurrentValue = lot.remainingQuantity * currentPrice;
    const lotUnrealized = lotCurrentValue - lotCostBasis;

    costBasisTotal += lotCostBasis;
    currentValueTotal += lotCurrentValue;

    if (lotUnrealized >= 0) {
      unrealizedGains += lotUnrealized;
    } else {
      unrealizedLosses += Math.abs(lotUnrealized);
    }
  }

  // ============================================================
  // Calculate Tax Summary
  // ============================================================

  let totalRealizedGains = 0;
  let totalRealizedLosses = 0;
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;

  for (const entry of gainLossEntries) {
    if (entry.gainLoss >= 0) {
      totalRealizedGains += entry.gainLoss;
      if (entry.holdingPeriod === 'short_term') {
        shortTermGains += entry.gainLoss;
      } else {
        longTermGains += entry.gainLoss;
      }
    } else {
      totalRealizedLosses += Math.abs(entry.gainLoss);
      if (entry.holdingPeriod === 'short_term') {
        shortTermLosses += Math.abs(entry.gainLoss);
      } else {
        longTermLosses += Math.abs(entry.gainLoss);
      }
    }
  }

  const summary: TaxSummary = {
    totalRealizedGains: Math.round(totalRealizedGains * 100) / 100,
    totalRealizedLosses: Math.round(totalRealizedLosses * 100) / 100,
    netRealizedGainLoss: Math.round((totalRealizedGains - totalRealizedLosses) * 100) / 100,
    shortTermGains: Math.round(shortTermGains * 100) / 100,
    shortTermLosses: Math.round(shortTermLosses * 100) / 100,
    longTermGains: Math.round(longTermGains * 100) / 100,
    longTermLosses: Math.round(longTermLosses * 100) / 100,
    totalTransactions: sortedTransactions.length,
    taxableEvents,
    unrealizedGains: Math.round(unrealizedGains * 100) / 100,
    unrealizedLosses: Math.round(unrealizedLosses * 100) / 100,
    costBasisTotal: Math.round(costBasisTotal * 100) / 100,
    currentValueTotal: Math.round(currentValueTotal * 100) / 100,
  };

  // ============================================================
  // Create Tax Report
  // ============================================================

  const report: TaxReport = {
    id: generateId('tax-'),
    year,
    method,
    summary,
    gainLossEntries,
    taxLots: remainingLots,
    generatedAt: new Date().toISOString(),
  };

  return report;
}

/**
 * Get list of available years from transactions
 * @param transactions List of transactions
 * @returns List of unique years sorted descending
 */
export function getAvailableYears(transactions: Transaction[]): number[] {
  const years = new Set<number>();
  for (const tx of transactions) {
    years.add(new Date(tx.date).getFullYear());
  }
  return Array.from(years).sort((a, b) => b - a);
}
