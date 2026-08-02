/**
 * useInvestmentReturnDetail
 *
 * Hydrate-first: module cache shows last payload immediately; refreshes silently
 * after sync / wallet change (same pattern as usePortfolio).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import type {
  InvestmentReturnAsset,
  InvestmentReturnDetail,
  InvestmentReturnHistoryPoint,
} from '@/lib/finance/investment-return';

export type {
  InvestmentReturnAsset,
  InvestmentReturnDetail,
  InvestmentReturnHistoryPoint,
};

interface UseInvestmentReturnDetailReturn {
  detail: InvestmentReturnDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type CacheEntry = {
  detail: InvestmentReturnDetail | null;
  error: string | null;
  isLoading: boolean;
  hasLoadedOnce: boolean;
  inflight: Promise<void> | null;
  lastSyncSeen: number;
};

const cache = new Map<string, CacheEntry>();
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

function getEntry(walletId: string): CacheEntry {
  let entry = cache.get(walletId);
  if (!entry) {
    entry = {
      detail: null,
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

async function loadDetail(walletId: string, opts?: { force?: boolean }): Promise<void> {
  const entry = getEntry(walletId);
  const force = Boolean(opts?.force);
  if (entry.inflight && !force) return entry.inflight;

  const showSpinner = !entry.hasLoadedOnce || force;
  if (showSpinner) {
    entry.isLoading = true;
    entry.error = null;
    emit();
  }

  const run = (async () => {
    try {
      const params = new URLSearchParams({ walletId });
      const response = await fetch(`/api/portfolio/investment-return?${params}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        entry.detail = result.data as InvestmentReturnDetail;
        entry.hasLoadedOnce = true;
        entry.error = null;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      console.error('[useInvestmentReturnDetail] Error:', err);
      // Keep last good detail on silent refresh failures.
      if (!entry.hasLoadedOnce) {
        entry.error =
          err instanceof Error ? err.message : 'Failed to load investment return';
      }
    } finally {
      entry.isLoading = false;
      entry.inflight = null;
      emit();
    }
  })();

  entry.inflight = run;
  return run;
}

/** Soft prefetch so opening the tab rarely waits on a cold compute. */
export function prefetchInvestmentReturnDetail(walletId: string | null | undefined) {
  if (!walletId) return;
  void loadDetail(walletId, { force: false });
}

export function useInvestmentReturnDetail(): UseInvestmentReturnDetailReturn {
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump(n => n + 1)), []);

  useEffect(() => {
    if (!activeWalletId) return;
    void loadDetail(activeWalletId, { force: false });
  }, [activeWalletId]);

  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    const entry = getEntry(activeWalletId);
    if (lastSyncAt === entry.lastSyncSeen) return;
    if (!entry.hasLoadedOnce) {
      entry.lastSyncSeen = lastSyncAt;
      return;
    }
    entry.lastSyncSeen = lastSyncAt;
    void loadDetail(activeWalletId, { force: false });
  }, [activeWalletId, lastSyncAt]);

  const refetch = useCallback(async () => {
    if (!activeWalletId) return;
    await loadDetail(activeWalletId, { force: true });
  }, [activeWalletId]);

  if (!activeWalletId) {
    return { detail: null, isLoading: false, error: null, refetch };
  }

  const entry = getEntry(activeWalletId);
  return {
    detail: entry.detail,
    isLoading: entry.isLoading && !entry.detail,
    error: entry.error,
    refetch,
  };
}
