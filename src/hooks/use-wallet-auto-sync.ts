/**
 * useWalletAutoSync Hook
 *
 * Automatically syncs the active wallet every 60 seconds.
 * Only fetches new transactions (incremental sync).
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useWalletStore } from '@/stores/wallet-store';

const SYNC_INTERVAL_MS = 60_000; // 1 minute

export function useWalletAutoSync() {
  const wallets = useWalletStore(state => state.wallets);
  const activeWalletId = useWalletStore(state => state.activeWalletId);
  const isSyncing = useWalletStore(state => state.isSyncing);
  const syncWallet = useWalletStore(state => state.syncWallet);
  const lastSyncAt = useWalletStore(state => state.lastSyncAt);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check for new transactions on the active wallet
  const checkForNewTransactions = useCallback(async () => {
    if (!activeWalletId) return;

    const syncingState = isSyncing[activeWalletId];
    if (syncingState) return; // Already syncing

    const lastSync = lastSyncAt[activeWalletId] || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    // Only sync if enough time has passed
    if (timeSinceLastSync < SYNC_INTERVAL_MS - 5000) return;

    try {
      // Try Supabase sync first (incremental)
      const wallet = wallets.find(w => w.id === activeWalletId);
      if (wallet) {
        try {
          const response = await fetch(`/api/wallets/${activeWalletId}/sync`, {
            method: 'POST',
          });

          if (response.ok) {
            const result = await response.json();
            if (result.newTransactions > 0) {
              // Refresh local state from DB
              const txResponse = await fetch(`/api/wallets/${activeWalletId}/transactions`);
              if (txResponse.ok) {
                const txResult = await txResponse.json();
                if (txResult.data) {
                  useWalletStore.getState().setTransactions(activeWalletId, txResult.data);
                }
              }
            }
            // Update last sync timestamp
            useWalletStore.setState(state => ({
              lastSyncAt: { ...state.lastSyncAt, [activeWalletId]: Date.now() },
            }));
            return;
          }
        } catch {
          // Supabase not available, use Alchemy direct
        }
      }

      // Fallback: sync via store (which uses Alchemy API)
      await syncWallet(activeWalletId);
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }, [activeWalletId, isSyncing, lastSyncAt, syncWallet, wallets]);

  // Set up interval
  useEffect(() => {
    if (!activeWalletId) return;

    // Initial check after 10 seconds
    const initialTimeout = setTimeout(() => {
      checkForNewTransactions();
    }, 10_000);

    // Set up recurring check
    intervalRef.current = setInterval(() => {
      checkForNewTransactions();
    }, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeWalletId, checkForNewTransactions]);

  // Manual trigger
  const triggerSync = useCallback(() => {
    if (activeWalletId) {
      syncWallet(activeWalletId);
    }
  }, [activeWalletId, syncWallet]);

  return { triggerSync };
}
