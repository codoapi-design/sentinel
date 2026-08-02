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
  const currentPlan = useWalletStore(state => state.currentPlan);
  const syncWallet = useWalletStore(state => state.syncWallet);
  const loadTransactionsFromDB = useWalletStore(state => state.loadTransactionsFromDB);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Prevents overlapping auto-syncs (Business plan interval can be shorter than sync duration). */
  const inFlightRef = useRef(false);
  const activeWalletIdRef = useRef(activeWalletId);
  const isLoadingWalletsRef = useRef(isLoadingWallets);
  const syncIntervalMsRef = useRef(
    PLAN_LIMITS[currentPlan]?.syncIntervalMs ?? PLAN_LIMITS.pro.syncIntervalMs,
  );

  activeWalletIdRef.current = activeWalletId;
  isLoadingWalletsRef.current = isLoadingWallets;
  syncIntervalMsRef.current =
    PLAN_LIMITS[currentPlan]?.syncIntervalMs ?? PLAN_LIMITS.pro.syncIntervalMs;

  const syncIntervalMs = syncIntervalMsRef.current;

  const runIncrementalRefresh = useCallback(async () => {
    const walletId = activeWalletIdRef.current;
    if (!walletId || isLoadingWalletsRef.current) return;
    if (!isUUID(walletId)) {
      console.warn('[AutoSync] Active wallet ID is not a valid UUID, skipping sync');
      return;
    }
    if (inFlightRef.current) return;

    const store = useWalletStore.getState();
    if (store.isSyncing[walletId]) return;

    const wallet = store.wallets.find(w => w.id === walletId);
    if (!wallet) return;
    // Wait until the wallet has completed at least one sync before auto-refresh.
    if (!wallet.lastSyncedAt) return;

    const subState = useSubscriptionStore.getState();
    if (!subState.serverHydrated) return;
    const entitlement = subState.getEntitlement();
    if (!entitlement.entitled) {
      console.warn('[AutoSync] Subscription inactive — auto sync paused');
      return;
    }

    const lastSync = store.lastSyncAt[walletId] || 0;
    const interval = syncIntervalMsRef.current;
    if (lastSync > 0 && Date.now() - lastSync < interval - 5_000) return;

    inFlightRef.current = true;
    useWalletStore.setState(state => ({
      isSyncing: { ...state.isSyncing, [walletId]: true },
      wallets: state.wallets.map(w =>
        w.id === walletId ? { ...w, isSyncing: true } : w,
      ),
    }));

    try {
      const response = await fetch(`/api/wallets/${walletId}/sync`, {
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

      // Another sync is already running server-side — do not retry.
      if (response.status === 409) {
        console.log('[AutoSync] Sync already in progress — skipped');
        return;
      }

      if (!response.ok) {
        console.warn('[AutoSync] Incremental sync failed:', response.status);
        return;
      }

      const result = await response.json();
      const changed = Boolean(result.changed);

      if (changed) {
        await loadTransactionsFromDB(walletId);
      }

      useWalletStore.setState(state => ({
        lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
        wallets: state.wallets.map(w =>
          w.id === walletId
            ? { ...w, lastSyncedAt: new Date().toISOString(), isSyncing: false }
            : w,
        ),
        isSyncing: { ...state.isSyncing, [walletId]: false },
      }));

      console.log('[AutoSync] Incremental sync done:', {
        changed,
        records: result.totalRecordsSynced,
        durationMs: result.durationMs,
      });
    } catch (error) {
      console.error('[AutoSync] error:', error);
    } finally {
      inFlightRef.current = false;
      const id = activeWalletIdRef.current;
      if (id) {
        useWalletStore.setState(state => {
          if (!state.isSyncing[id]) return state;
          return {
            isSyncing: { ...state.isSyncing, [id]: false },
            wallets: state.wallets.map(w =>
              w.id === id ? { ...w, isSyncing: false } : w,
            ),
          };
        });
      }
    }
  }, [loadTransactionsFromDB]);

  useEffect(() => {
    if (!activeWalletId || !isUUID(activeWalletId)) return;

    // First auto-sync after a short delay so DB hydrate can finish first.
    const initialTimeout = setTimeout(() => {
      void runIncrementalRefresh();
    }, 20_000);

    intervalRef.current = setInterval(() => {
      void runIncrementalRefresh();
    }, syncIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // Intentionally exclude runIncrementalRefresh identity churn from volatile store fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWalletId, syncIntervalMs]);

  const triggerSync = useCallback(async () => {
    if (!activeWalletId) return;
    if (!isUUID(activeWalletId)) {
      console.warn('[AutoSync] Cannot sync: wallet ID is not a valid UUID');
      toast.error('Cannot sync this wallet. Try removing and re-adding it.');
      return;
    }

    const store = useWalletStore.getState();
    if (store.isSyncing[activeWalletId] || inFlightRef.current) {
      toast.message('Sync already in progress…');
      return;
    }

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
  }, [activeWalletId, syncWallet]);

  return { triggerSync, syncIntervalMs };
}
