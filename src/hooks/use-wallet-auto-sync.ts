/**
 * useWalletAutoSync Hook
 *
 * Background sync loop for the active wallet:
 *   1. Every N seconds (plan-based) run an incremental sync
 *   2. Manual Sync always runs immediately while the subscription is active
 *
 * When the subscription expires, auto and manual sync pause until renew.
 * On renew, incremental sync resumes from lastSyncedAt / last_synced_block.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useWalletStore, PLAN_LIMITS } from '@/stores/wallet-store';
import { useSubscriptionStore } from '@/stores/subscription-store';
import { useUpgradePromptStore } from '@/stores/upgrade-prompt-store';
import { FREE_PLAN_EXPIRED_MESSAGE, SUBSCRIPTION_EXPIRED_MESSAGE } from '@/lib/plans/entitlements';

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function promptUpgradeIfExpired(): boolean {
  const subState = useSubscriptionStore.getState();
  if (!subState.serverHydrated) return false;
  const entitlement = subState.getEntitlement();
  if (entitlement.entitled) return false;
  useUpgradePromptStore.getState().openUpgradePrompt(
    entitlement.planId === 'free'
      ? FREE_PLAN_EXPIRED_MESSAGE
      : entitlement.reason || SUBSCRIPTION_EXPIRED_MESSAGE,
  );
  return true;
}

export function useWalletAutoSync() {
  const activeWalletId = useWalletStore(state => state.activeWalletId);
  const isLoadingWallets = useWalletStore(state => state.isLoadingWallets);
  const isSyncing = useWalletStore(state => state.isSyncing);
  const lastSyncAt = useWalletStore(state => state.lastSyncAt);
  const currentPlan = useWalletStore(state => state.currentPlan);
  const wallets = useWalletStore(state => state.wallets);
  const syncWallet = useWalletStore(state => state.syncWallet);
  const loadTransactionsFromDB = useWalletStore(state => state.loadTransactionsFromDB);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncIntervalMs =
    PLAN_LIMITS[currentPlan]?.syncIntervalMs ?? PLAN_LIMITS.pro.syncIntervalMs;

  const runIncrementalRefresh = useCallback(async () => {
    if (!activeWalletId || isLoadingWallets) return;
    if (!isUUID(activeWalletId)) {
      console.warn('[AutoSync] Active wallet ID is not a valid UUID, skipping sync');
      return;
    }
    if (isSyncing[activeWalletId]) return;

    const subState = useSubscriptionStore.getState();
    if (!subState.serverHydrated) return;
    const entitlement = subState.getEntitlement();
    if (!entitlement.entitled) {
      console.warn('[AutoSync] Subscription inactive — auto sync paused');
      return;
    }

    const lastSync = lastSyncAt[activeWalletId] || 0;
    if (Date.now() - lastSync < syncIntervalMs - 5_000) return;

    const wallet = wallets.find(w => w.id === activeWalletId);
    if (!wallet) return;

    try {
      const response = await fetch(`/api/wallets/${activeWalletId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      });

      if (response.status === 402) {
        const payload = await response.json().catch(() => ({}));
        console.warn('[AutoSync] Entitlement blocked:', payload.error);
        promptUpgradeIfExpired();
        return;
      }

      if (!response.ok) {
        await syncWallet(activeWalletId, 'incremental');
        return;
      }

      const result = await response.json();
      const changed = Boolean(result.changed);

      if (changed) {
        await loadTransactionsFromDB(activeWalletId);
      }

      useWalletStore.setState(state => ({
        lastSyncAt: { ...state.lastSyncAt, [activeWalletId]: Date.now() },
        wallets: state.wallets.map(w =>
          w.id === activeWalletId
            ? { ...w, lastSyncedAt: new Date().toISOString(), isSyncing: false }
            : w
        ),
        isSyncing: { ...state.isSyncing, [activeWalletId]: false },
      }));

      console.log('[AutoSync] Incremental sync done:', {
        changed,
        records: result.totalRecordsSynced,
        durationMs: result.durationMs,
      });
    } catch (error) {
      console.error('[AutoSync] error:', error);
    }
  }, [
    activeWalletId,
    isLoadingWallets,
    isSyncing,
    lastSyncAt,
    syncIntervalMs,
    wallets,
    syncWallet,
    loadTransactionsFromDB,
  ]);

  useEffect(() => {
    if (!activeWalletId || !isUUID(activeWalletId)) return;

    const initialTimeout = setTimeout(() => {
      runIncrementalRefresh();
    }, 15_000);

    intervalRef.current = setInterval(() => {
      runIncrementalRefresh();
    }, syncIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeWalletId, runIncrementalRefresh, syncIntervalMs]);

  const triggerSync = useCallback(async () => {
    if (!activeWalletId) return;
    if (!isUUID(activeWalletId)) {
      console.warn('[AutoSync] Cannot sync: wallet ID is not a valid UUID');
      toast.error('Cannot sync this wallet. Try removing and re-adding it.');
      return;
    }
    if (isSyncing[activeWalletId]) return;

    const subState = useSubscriptionStore.getState();
    if (!subState.serverHydrated) return;
    const entitlement = subState.getEntitlement();
    if (!entitlement.entitled) {
      promptUpgradeIfExpired();
      return;
    }

    const toastId = toast.loading('Syncing wallet from blockchain...');
    try {
      const result = await syncWallet(activeWalletId, 'full');
      if (result.success) {
        const count = result.recordsSynced ?? 0;
        toast.success(
          count > 0
            ? `Sync complete — ${count} record${count === 1 ? '' : 's'} updated`
            : 'Sync complete — portfolio is up to date',
          { id: toastId },
        );
      } else {
        if (/expired|subscription|upgrade|Free Plan/i.test(result.error || '')) {
          promptUpgradeIfExpired();
        }
        toast.error(result.error || 'Sync failed. Please try again.', { id: toastId });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Sync failed. Please try again.',
        { id: toastId },
      );
    }
  }, [activeWalletId, isSyncing, syncWallet]);

  return { triggerSync, syncIntervalMs };
}
