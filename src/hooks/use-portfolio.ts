/**
 * usePortfolio Hook
 *
 * Fetches portfolio data from /api/portfolio, which ALWAYS reads from Supabase.
 * Re-fetches whenever the wallet store reports a completed sync (lastSyncAt),
 * so the UI stays in lockstep with the database without hitting external APIs.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function usePortfolio(): UsePortfolioReturn {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const fetchGen = useRef(0);
  const hasLoadedOnce = useRef(false);

  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const wallets = useWalletStore(s => s.wallets);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );

  const fetchPortfolio = useCallback(async (forceRefresh = false) => {
    const activeWallet = wallets.find(w => w.id === activeWalletId);
    if (!activeWallet) {
      setPortfolio(null);
      hasLoadedOnce.current = false;
      return;
    }

    const gen = ++fetchGen.current;
    // Soft loading only on first load or explicit refresh — silent refresh after sync
    if (!hasLoadedOnce.current || forceRefresh) setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('walletId', activeWallet.id);
      // forceRefresh triggers sync-then-DB on the server; routine polls never set it
      if (forceRefresh) params.set('refresh', 'true');

      const response = await fetch(`/api/portfolio?${params.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to fetch portfolio' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (gen !== fetchGen.current) return; // stale

      if (result.success && result.data) {
        setPortfolio(result.data);
        setSource(result.source || 'database');
        hasLoadedOnce.current = true;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      if (gen !== fetchGen.current) return;
      console.error('[usePortfolio] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
    } finally {
      if (gen === fetchGen.current) setIsLoading(false);
    }
  }, [activeWalletId, wallets]);

  // Initial load + wallet switch
  useEffect(() => {
    hasLoadedOnce.current = false;
    fetchPortfolio(false);
  }, [activeWalletId, fetchPortfolio]);

  // After any completed sync, re-read portfolio from the DB (no external APIs)
  const prevSyncAt = useRef(0);
  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    if (lastSyncAt === prevSyncAt.current) return;
    prevSyncAt.current = lastSyncAt;
    // Skip the very first lastSyncAt=0→N if we just did the initial fetch
    if (hasLoadedOnce.current) {
      fetchPortfolio(false);
    }
  }, [lastSyncAt, activeWalletId, fetchPortfolio]);

  return {
    portfolio,
    isLoading,
    error,
    refetch: (refresh?: boolean) => fetchPortfolio(Boolean(refresh)),
    source,
  };
}
