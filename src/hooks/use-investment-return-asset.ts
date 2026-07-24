/**
 * useInvestmentReturnAsset
 *
 * Fetches per-asset investment-return detail from
 * GET /api/portfolio/investment-return/asset.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import type { InvestmentReturnAssetDetail } from '@/lib/finance/investment-return';

export type { InvestmentReturnAssetDetail };

export interface InvestmentReturnAssetParams {
  symbol: string;
  address: string | null;
  chainId: number;
  network: string;
}

interface UseInvestmentReturnAssetReturn {
  detail: InvestmentReturnAssetDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useInvestmentReturnAsset(
  params: InvestmentReturnAssetParams | null,
): UseInvestmentReturnAssetReturn {
  const [detail, setDetail] = useState<InvestmentReturnAssetDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGen = useRef(0);
  const hasLoadedOnce = useRef(false);

  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const wallets = useWalletStore(s => s.wallets);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );

  const fetchDetail = useCallback(async () => {
    const activeWallet = wallets.find(w => w.id === activeWalletId);
    if (!activeWallet || !params?.symbol) {
      setDetail(null);
      hasLoadedOnce.current = false;
      return;
    }

    const gen = ++fetchGen.current;
    if (!hasLoadedOnce.current) setIsLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams({
        walletId: activeWallet.id,
        symbol: params.symbol,
        chainId: String(params.chainId || 1),
        network: params.network || 'ethereum',
      });
      if (params.address) qs.set('address', params.address);

      const response = await fetch(`/api/portfolio/investment-return/asset?${qs}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (gen !== fetchGen.current) return;
      if (result.success && result.data) {
        setDetail(result.data as InvestmentReturnAssetDetail);
        hasLoadedOnce.current = true;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      if (gen !== fetchGen.current) return;
      console.error('[useInvestmentReturnAsset] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load asset return');
    } finally {
      if (gen === fetchGen.current) setIsLoading(false);
    }
  }, [activeWalletId, wallets, params]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    fetchDetail();
  }, [activeWalletId, params?.symbol, params?.address, params?.chainId, params?.network, fetchDetail]);

  const prevSyncAt = useRef(0);
  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    if (lastSyncAt === prevSyncAt.current) return;
    prevSyncAt.current = lastSyncAt;
    if (hasLoadedOnce.current) {
      fetchDetail();
    }
  }, [lastSyncAt, activeWalletId, fetchDetail]);

  return {
    detail,
    isLoading,
    error,
    refetch: fetchDetail,
  };
}
