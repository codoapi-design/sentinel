'use client';

import { create } from 'zustand';

interface UpgradePromptState {
  open: boolean;
  reason: string | null;
  lastShownAt: number;
  openUpgradePrompt: (reason?: string) => void;
  closeUpgradePrompt: () => void;
}

const DEFAULT_REASON =
  'Your Free Plan has ended. Upgrade to keep syncing wallets and using AI features.';

export const useUpgradePromptStore = create<UpgradePromptState>((set, get) => ({
  open: false,
  reason: null,
  lastShownAt: 0,
  openUpgradePrompt: (reason) => {
    set({
      open: true,
      reason: reason || DEFAULT_REASON,
      lastShownAt: Date.now(),
    });
  },
  closeUpgradePrompt: () => set({ open: false }),
}));

export { DEFAULT_REASON as FREE_PLAN_EXPIRED_PROMPT };
