import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pricingTiers, type PricingTier } from '@/lib/mock-data';

// ============================================================
// Types
// ============================================================

export interface Subscription {
  planId: string;
  planName: string;
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  startDate: string; // ISO date
  endDate: string;   // ISO date
  txHash: string;
  paymentToken: 'USDC' | 'USDT' | 'FREE';
  paymentChain: number;
  status: 'active' | 'expired' | 'cancelled';
  /** Shared AI requests consumed during a Free Plan trial. */
  aiRequestsUsed?: number;
}

interface SubscriptionState {
  subscription: Subscription | null;
  /** Remembers that a free trial was started on this browser (one-shot). */
  freeTrialClaimed: boolean;
  setSubscription: (sub: Subscription) => void;
  clearSubscription: () => void;
  markFreeTrialClaimed: () => void;
  isActive: () => boolean;
  getPlan: () => PricingTier | null;
  getDaysRemaining: () => number;
  hasUsedFreeTrial: () => boolean;
  getPlanLimits: () => {
    wallets: number;
    networks: number;
    transactions: number;
    syncInterval: string;
    reports: string;
    aiRequests?: number | null;
  } | null;
}

const FREE_TRIAL_TX = 'free-trial';

// ============================================================
// Store
// ============================================================

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      subscription: null,
      freeTrialClaimed: false,

      setSubscription: (sub: Subscription) => {
        set(state => ({
          subscription: sub,
          freeTrialClaimed:
            state.freeTrialClaimed ||
            sub.planId === 'free' ||
            sub.txHash === FREE_TRIAL_TX,
        }));
      },

      clearSubscription: () => {
        set({ subscription: null });
        localStorage.removeItem('cryptobooks_subscription');
      },

      markFreeTrialClaimed: () => {
        set({ freeTrialClaimed: true });
      },

      isActive: () => {
        const sub = get().subscription;
        if (!sub) return false;
        if (sub.status !== 'active') return false;
        return new Date(sub.endDate) > new Date();
      },

      getPlan: () => {
        const sub = get().subscription;
        if (!sub) return null;
        return pricingTiers.find(t => t.id === sub.planId) || null;
      },

      getDaysRemaining: () => {
        const sub = get().subscription;
        if (!sub) return 0;
        const end = new Date(sub.endDate);
        const now = new Date();
        const diff = end.getTime() - now.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      },

      hasUsedFreeTrial: () => {
        const state = get();
        if (state.freeTrialClaimed) return true;
        const sub = state.subscription;
        if (!sub) return false;
        return sub.planId === 'free' || sub.txHash === FREE_TRIAL_TX;
      },

      getPlanLimits: () => {
        const plan = get().getPlan();
        if (!plan) return null;
        return plan.limits;
      },
    }),
    {
      name: 'cryptobooks_subscription',
    }
  )
);

export { FREE_TRIAL_TX };
