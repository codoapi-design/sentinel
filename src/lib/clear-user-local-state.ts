/**
 * Clear browser-local user data so accounts never share wallets/lists.
 * Called on sign-out and when the authenticated user id changes.
 */

import { useWalletStore } from '@/stores/wallet-store';
import { useUiPreferencesStore, UI_PREFERENCES_STORAGE_KEY } from '@/stores/ui-preferences-store';

/** Zustand persist keys + legacy keys that hold user-scoped data */
export const USER_SCOPED_STORAGE_KEYS = [
  'sentinel-wallets',
  'cryptobooks-wallets',
  'cryptobooks-ai', // legacy key from removed AI store
  'cryptobooks_subscription',
  UI_PREFERENCES_STORAGE_KEY,
] as const;

export function clearUserLocalState(nextUserId: string | null = null): void {
  if (typeof window !== 'undefined') {
    for (const key of USER_SCOPED_STORAGE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore quota / private mode
      }
    }
  }

  useWalletStore.getState().reset();
  if (nextUserId) {
    useWalletStore.setState({ ownerUserId: nextUserId });
  }

  try {
    useUiPreferencesStore.getState().reset();
  } catch {
    // ignore
  }
}
