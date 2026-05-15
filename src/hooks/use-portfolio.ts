/**
 * usePortfolio Hook
 *
 * Fetches real blockchain portfolio data from the /api/portfolio endpoint.
 * Used by dashboard components to display real wallet data instead of mock data.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
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
  transactionCount: number;
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
  providers?: string[];
  lastSyncedAt: string | null;
  isSyncing: boolean;
}

interface UsePortfolioReturn {
  portfolio: PortfolioData | null;
  isLoading: boolean;
  error: string | null;
  refetch: (refresh?: boolean) => Promise<void>;
  source: string | null;
}

export function usePortfolio(): UsePortfolioReturn {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const { activeWalletId, wallets } = useWalletStore();

  const fetchPortfolio = useCallback(async (forceRefresh = false) => {
    const activeWallet = wallets.find(w => w.id === activeWalletId);
    if (!activeWallet) {
      setPortfolio(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('walletId', activeWallet.id);
      if (forceRefresh) params.set('refresh', 'true');

      const response = await fetch(`/api/portfolio?${params.toString()}`);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to fetch portfolio' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        setPortfolio(result.data);
        setSource(result.source || 'unknown');
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      console.error('[usePortfolio] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
    } finally {
      setIsLoading(false);
    }
  }, [activeWalletId, wallets]);

  // Auto-fetch on mount and when wallet changes
  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return {
    portfolio,
    isLoading,
    error,
    refetch: (refresh?: boolean) => fetchPortfolio(refresh),
    source,
  };
}
