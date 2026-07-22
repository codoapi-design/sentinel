'use client';

import { useMemo } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import { filterVisibleTransactions } from '@/lib/finance/visibility';
import type { Transaction } from '@/lib/mock-data';

/**
 * Returns the real transactions of the currently-active wallet from the store.
 *
 * By default, spam and $0 / dust txs are hidden (see Show spam & $0 toggle).
 * Pass `{ includeHidden: true }` to bypass the preference (e.g. diagnostics).
 */
export function useActiveTransactions(options?: {
  includeHidden?: boolean;
}): Transaction[] {
  const transactionsMap = useWalletStore((s) => s.transactionsMap);
  const activeWalletId = useWalletStore((s) => s.activeWalletId);
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const includeHidden = options?.includeHidden === true;

  return useMemo(() => {
    const raw = activeWalletId ? transactionsMap[activeWalletId] ?? [] : [];
    if (includeHidden) return raw;
    return filterVisibleTransactions(raw, showSpamAndDust);
  }, [transactionsMap, activeWalletId, showSpamAndDust, includeHidden]);
}
