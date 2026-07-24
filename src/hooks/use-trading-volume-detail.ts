/**
 * useTradingVolumeDetail
 *
 * Fetches full trading-volume detail from GET /api/portfolio/trading-volume.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import type { TradingVolumeDetail } from '@/lib/finance/trading-volume';

export type { TradingVolumeDetail };

interface UseTradingVolumeDetailReturn {
  detail: TradingVolumeDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTradingVolumeDetail(): UseTradingVolumeDetailReturn {
  const [detail, setDetail] = useState<TradingVolumeDetail | null>(null);
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
    if (!activeWallet) {
      setDetail(null);
      hasLoadedOnce.current = false;
      return;
    }

    const gen = ++fetchGen.current;
    if (!hasLoadedOnce.current) setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ walletId: activeWallet.id });
      const response = await fetch(`/api/portfolio/trading-volume?${params}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (gen !== fetchGen.current) return;
      if (result.success && result.data) {
        setDetail(result.data as TradingVolumeDetail);
        hasLoadedOnce.current = true;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      if (gen !== fetchGen.current) return;
      console.error('[useTradingVolumeDetail] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load trading volume');
    } finally {
      if (gen === fetchGen.current) setIsLoading(false);
    }
  }, [activeWalletId, wallets]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    fetchDetail();
  }, [activeWalletId, fetchDetail]);

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
