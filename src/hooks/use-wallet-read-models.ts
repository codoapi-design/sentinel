/**
 * Instant dashboard hydrate from wallet read models.
 * Silent-refreshes after wallet-store lastSyncAt changes.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWalletStore } from '@/stores/wallet-store';

export type ReadModelDimension = {
  dimension: string;
  key: string;
  label: string | null;
  txCount: number;
  volumeUsd: number;
  inflowUsd: number;
  outflowUsd: number;
  topToken: string | null;
  lastTxDate: string | null;
};

export type ReadModelSummary = {
  inflowUsd: number;
  outflowUsd: number;
  netFlowUsd: number;
  gasFeesUsd: number;
  tradingVolumeUsd: number;
  txCount: number;
  pricedCashflowCount: number;
  unpricedCount: number;
  excludedActivityCount: number;
  methodology: string | null;
  updatedAt: string;
};

export type WalletReadModels = {
  walletId: string;
  summary: ReadModelSummary | null;
  dimensions: ReadModelDimension[];
};

export function useWalletReadModels() {
  const [data, setData] = useState<WalletReadModels | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const fetchGen = useRef(0);

  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );

  const fetchModels = useCallback(async (opts?: { silent?: boolean }) => {
    if (!activeWalletId) {
      setData(null);
      hasLoadedOnce.current = false;
      return;
    }
    const gen = ++fetchGen.current;
    if (!opts?.silent && !hasLoadedOnce.current) setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallets/${activeWalletId}/read-models`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (gen !== fetchGen.current) return;
      if (json.success && json.data) {
        setData(json.data as WalletReadModels);
        hasLoadedOnce.current = true;
      }
    } catch (err) {
      if (gen !== fetchGen.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load read models');
    } finally {
      if (gen === fetchGen.current) setIsLoading(false);
    }
  }, [activeWalletId]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    void fetchModels();
  }, [activeWalletId, fetchModels]);

  const prevSync = useRef(0);
  useEffect(() => {
    if (!activeWalletId || !lastSyncAt) return;
    if (lastSyncAt === prevSync.current) return;
    prevSync.current = lastSyncAt;
    void fetchModels({ silent: true });
  }, [activeWalletId, lastSyncAt, fetchModels]);

  // Memoize per-dimension slices — returning a fresh .filter() every render
  // invalidates downstream useMemos and can cause max-update-depth loops
  // (e.g. ClientsTab onFilteredDataChange → setState → re-render → new array).
  const dimensions = data?.dimensions;
  const clients = useMemo(
    () => (dimensions || []).filter(d => d.dimension === 'client'),
    [dimensions],
  );
  const networks = useMemo(
    () => (dimensions || []).filter(d => d.dimension === 'network'),
    [dimensions],
  );
  const types = useMemo(
    () => (dimensions || []).filter(d => d.dimension === 'type'),
    [dimensions],
  );
  const assets = useMemo(
    () => (dimensions || []).filter(d => d.dimension === 'asset'),
    [dimensions],
  );

  return {
    data,
    summary: data?.summary ?? null,
    clients,
    networks,
    types,
    assets,
    isLoading,
    error,
    refetch: fetchModels,
  };
}
