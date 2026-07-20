'use client';

import { useMemo } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import type { Transaction } from '@/lib/mock-data';

/**
 * Returns the real transactions of the currently-active wallet from the store.
 *
 * Replaces the old `generateTransactions()` mock source across detail pages.
 * When there is no active wallet (e.g. demo mode or before syncing), this
 * returns an empty array so views render empty states instead of fake data.
 */
export function useActiveTransactions(): Transaction[] {
  const transactionsMap = useWalletStore((s) => s.transactionsMap);
  const activeWalletId = useWalletStore((s) => s.activeWalletId);

  return useMemo(
    () => (activeWalletId ? transactionsMap[activeWalletId] ?? [] : []),
    [transactionsMap, activeWalletId],
  );
}
