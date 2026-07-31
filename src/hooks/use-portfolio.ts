/**
 * usePortfolio Hook
 *
 * Fetches portfolio holdings from /api/portfolio (DB-first, fast path).
 * Shared module cache + in-flight dedupe so Overview / Chart / Assets
 * share one request per wallet instead of N parallel heavy GETs.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWalletStore } from '@/stores/wallet-store';

export interface PortfolioToken {
  id?: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  change24h: number | null;
  chain: string;
  chainId: number;
  logoUrl: string | null;
  isSpam: boolean;
  isVerified: boolean;
  provider: string;
}

export interface PortfolioDeFiPosition {
  id: string;
  protocol: string;
  protocolId?: string;
  chain: string;
  type: string;
  netValueUsd: number;
  assetValueUsd: number;
  debtValueUsd: number;
  apy: number | null;
  healthFactor: number | null;
  logoUrl: string | null;
  provider: string;
}

export interface ChainBreakdown {
  chain: string;
  valueUsd: number;
  tokenCount: number;
  defiPositionCount: number;
}

export interface TransactionSummary {
  totalRevenue: number;
  totalExpenses: number;
  netFlow: number;
  gasFees: number;
  tradingVolume?: number;
  transactionCount: number;
  pricedCashflowCount?: number;
  unpricedCount?: number;
  excludedActivityCount?: number;
  methodology?: string;
}

export interface InvestmentReturnSummary {
  totalPnlUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  costBasisOpenUsd: number;
  costBasisClosedUsd: number;
  marketValueOpenUsd: number;
  returnPct: number | null;
  methodology: string;
  lotsCount: number;
  openLotsCount: number;
  sinceConnectedAt: string | null;
  baselineValueUsd: number | null;
  trackingActive: boolean;
}

export interface PortfolioData {
  walletId: string;
  address: string;
  totalValueUsd: number;
  tokenValueUsd: number;
  defiValueUsd: number;
  tokens: PortfolioToken[];
  defiPositions: PortfolioDeFiPosition[];
  chainBreakdown: ChainBreakdown[];
  transactionSummary: TransactionSummary | null;
  investmentReturn?: InvestmentReturnSummary | null;
  providers?: string[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
}

interface UsePortfolioReturn {
  portfolio: PortfolioData | null;
  isLoading: boolean;
  error: string | null;
  /** Pass true only for an explicit user-triggered refresh (runs sync then reads DB). */
  refetch: (refresh?: boolean) => Promise<void>;
  source: string | null;
}

type PortfolioCacheEntry = {
  portfolio: PortfolioData | null;
  source: string | null;
  error: string | null;
  isLoading: boolean;
  hasLoadedOnce: boolean;
  inflight: Promise<void> | null;
  lastSyncSeen: number;
};

const cache = new Map<string, PortfolioCacheEntry>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getEntry(walletId: string): PortfolioCacheEntry {
  let entry = cache.get(walletId);
  if (!entry) {
    entry = {
      portfolio: null,
      source: null,
      error: null,
      isLoading: false,
      hasLoadedOnce: false,
      inflight: null,
      lastSyncSeen: 0,
    };
    cache.set(walletId, entry);
  }
  return entry;
}

async function loadPortfolio(walletId: string, forceRefresh = false): Promise<void> {
  const entry = getEntry(walletId);
  if (entry.inflight && !forceRefresh) {
    return entry.inflight;
  }

  const showSpinner = !entry.hasLoadedOnce || forceRefresh;
  if (showSpinner) {
    entry.isLoading = true;
    entry.error = null;
    emit();
  }

  const run = (async () => {
    try {
      const params = new URLSearchParams();
      params.set('walletId', walletId);
      if (forceRefresh) params.set('refresh', 'true');

      const response = await fetch(`/api/portfolio?${params.toString()}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to fetch portfolio' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        entry.portfolio = result.data as PortfolioData;
        entry.source = result.source || 'database';
        entry.hasLoadedOnce = true;
        entry.error = null;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      console.error('[usePortfolio] Error:', err);
      entry.error = err instanceof Error ? err.message : 'Failed to load portfolio';
    } finally {
      entry.isLoading = false;
      entry.inflight = null;
      emit();
    }
  })();

  entry.inflight = run;
  return run;
}

export function usePortfolio(): UsePortfolioReturn {
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const wallets = useWalletStore(s => s.wallets);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump(n => n + 1)), []);

  useEffect(() => {
    if (!activeWalletId) return;
    const activeWallet = wallets.find(w => w.id === activeWalletId);
    if (!activeWallet) {
      const entry = getEntry(activeWalletId);
      entry.portfolio = null;
      entry.hasLoadedOnce = false;
      entry.error = null;
      emit();
      return;
    }
    void loadPortfolio(activeWalletId, false);
  }, [activeWalletId, wallets]);

  // Silent refresh after sync — debounced so streaming tx counts don't spam GETs
  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    const entry = getEntry(activeWalletId);
    if (lastSyncAt === entry.lastSyncSeen) return;
    if (!entry.hasLoadedOnce) {
      entry.lastSyncSeen = lastSyncAt;
      return;
    }
    entry.lastSyncSeen = lastSyncAt;
    const t = window.setTimeout(() => {
      void loadPortfolio(activeWalletId, false);
    }, 400);
    return () => window.clearTimeout(t);
  }, [lastSyncAt, activeWalletId]);

  const refetch = useCallback(
    async (refresh?: boolean) => {
      if (!activeWalletId) return;
      await loadPortfolio(activeWalletId, Boolean(refresh));
    },
    [activeWalletId],
  );

  if (!activeWalletId) {
    return {
      portfolio: null,
      isLoading: false,
      error: null,
      refetch,
      source: null,
    };
  }

  const entry = getEntry(activeWalletId);
  return {
    portfolio: entry.portfolio,
    isLoading: entry.isLoading,
    error: entry.error,
    refetch,
    source: entry.source,
  };
}
