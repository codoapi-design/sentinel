/**
 * useTradingVolumeDetail
 *
 * Hydrate-first:
 *  1) Instant seed from local wallet transactions (already in memory)
 *  2) Module cache for last API payload
 *  3) Silent API refresh after sync
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import type { Transaction } from '@/lib/mock-data';
import {
  computeTradingVolumeDetail,
  type TradingVolumeDetail,
  type TradingVolumeTxInput,
} from '@/lib/finance/trading-volume';

export type { TradingVolumeDetail };

interface UseTradingVolumeDetailReturn {
  detail: TradingVolumeDetail | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

type CacheEntry = {
  detail: TradingVolumeDetail | null;
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

function txsToVolumeInputs(txs: Transaction[]): TradingVolumeTxInput[] {
  return txs.map(tx => ({
    id: tx.id,
    tx_hash: tx.txHash,
    hash: tx.txHash,
    type: tx.type,
    direction: tx.direction,
    value_usd: tx.value,
    valueUsd: tx.value,
    timestamp: tx.timestamp,
    date: tx.date,
    network: tx.network,
    token_symbol: tx.token,
    tokenSymbol: tx.token,
    token_value: tx.quantity,
    tokenValue: tx.quantity,
    price_usd: tx.price,
    priceUsd: tx.price,
    counterparty: tx.counterparty,
    counterparty_label: tx.counterpartyLabel,
    counterpartyLabel: tx.counterpartyLabel,
    method_name: tx.methodName,
    methodName: tx.methodName,
  }));
}

async function loadDetail(walletId: string, opts?: { force?: boolean }): Promise<void> {
  const entry = getEntry(walletId);
  const force = Boolean(opts?.force);
  if (entry.inflight && !force) return entry.inflight;

  // Only block UI when we have nothing to show yet.
  const showSpinner = !entry.hasLoadedOnce && !entry.detail;
  if (showSpinner) {
    entry.isLoading = true;
    entry.error = null;
    emit();
  }

  const run = (async () => {
    try {
      const params = new URLSearchParams({ walletId });
      const response = await fetch(`/api/portfolio/trading-volume?${params}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        entry.detail = result.data as TradingVolumeDetail;
        entry.hasLoadedOnce = true;
        entry.error = null;
      } else {
        throw new Error(result.error || 'No data returned');
      }
    } catch (err) {
      console.error('[useTradingVolumeDetail] Error:', err);
      if (!entry.hasLoadedOnce && !entry.detail) {
        entry.error =
          err instanceof Error ? err.message : 'Failed to load trading volume';
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

export function prefetchTradingVolumeDetail(walletId: string | null | undefined) {
  if (!walletId) return;
  void loadDetail(walletId, { force: false });
}

export function useTradingVolumeDetail(): UseTradingVolumeDetailReturn {
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const transactionsMap = useWalletStore(s => s.transactionsMap);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump(n => n + 1)), []);

  const localSeed = useMemo(() => {
    if (!activeWalletId) return null;
    const txs = transactionsMap[activeWalletId] || [];
    if (txs.length === 0) return null;
    return computeTradingVolumeDetail(txsToVolumeInputs(txs));
  }, [activeWalletId, transactionsMap]);

  // Seed cache instantly from local txs before / while API runs.
  useEffect(() => {
    if (!activeWalletId || !localSeed) return;
    const entry = getEntry(activeWalletId);
    if (!entry.detail) {
      entry.detail = localSeed;
      emit();
    }
  }, [activeWalletId, localSeed]);

  useEffect(() => {
    if (!activeWalletId) return;
    void loadDetail(activeWalletId, { force: false });
  }, [activeWalletId]);

  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    const entry = getEntry(activeWalletId);
    if (lastSyncAt === entry.lastSyncSeen) return;
    entry.lastSyncSeen = lastSyncAt;
    // Prefer fresh local seed immediately after sync, then confirm via API.
    if (localSeed) {
      entry.detail = localSeed;
      emit();
    }
    void loadDetail(activeWalletId, { force: false });
  }, [activeWalletId, lastSyncAt, localSeed]);

  const refetch = useCallback(async () => {
    if (!activeWalletId) return;
    await loadDetail(activeWalletId, { force: true });
  }, [activeWalletId]);

  if (!activeWalletId) {
    return { detail: null, isLoading: false, error: null, refetch };
  }

  const entry = getEntry(activeWalletId);
  const detail = entry.detail || localSeed;
  return {
    detail,
    isLoading: entry.isLoading && !detail,
    error: entry.error,
    refetch,
  };
}
