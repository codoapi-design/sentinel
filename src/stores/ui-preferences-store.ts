/**
 * UI display preferences (persisted). Scoped via clearUserLocalState on auth change.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiPreferencesState {
  /** When false (default), spam tokens and $0 / dust assets & txs are hidden in list UIs. */
  showSpamAndDust: boolean;
  setShowSpamAndDust: (value: boolean) => void;
  toggleShowSpamAndDust: () => void;
  reset: () => void;
}

export const UI_PREFERENCES_STORAGE_KEY = 'cryptobooks_ui_preferences';

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set, get) => ({
      showSpamAndDust: false,

      setShowSpamAndDust: (value) => set({ showSpamAndDust: value }),

      toggleShowSpamAndDust: () => set({ showSpamAndDust: !get().showSpamAndDust }),

      reset: () => set({ showSpamAndDust: false }),
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      partialize: (state) => ({
        showSpamAndDust: state.showSpamAndDust,
      }),
    },
  ),
);
