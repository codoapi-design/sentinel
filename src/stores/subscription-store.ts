import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pricingTiers, type PricingTier } from '@/lib/mock-data';
import {
  buildPeriodEnd,
  evaluateClientSubscription,
  type EntitlementSnapshot,
} from '@/lib/plans/entitlements';

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
  /** ISO timestamp when sync was paused due to expiry (resume uses lastSyncedAt). */
  syncPausedAt?: string | null;
}

interface SubscriptionState {
  subscription: Subscription | null;
  /** Remembers that a free trial was started on this browser (one-shot). */
  freeTrialClaimed: boolean;
  setSubscription: (sub: Subscription) => void;
  clearSubscription: () => void;
  markFreeTrialClaimed: () => void;
  /** Marks active→expired when endDate passed; records syncPausedAt once. */
  refreshExpiry: () => EntitlementSnapshot;
  isActive: () => boolean;
  getEntitlement: () => EntitlementSnapshot;
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

export const FREE_TRIAL_TX = 'free-trial';

export function createSubscriptionPayload(args: {
  planId: string;
  billingPeriod: 'monthly' | 'yearly';
  txHash: string;
  paymentToken: Subscription['paymentToken'];
  paymentChain: number;
  price?: number;
}): Subscription {
  const tier = pricingTiers.find(t => t.id === args.planId);
  const start = new Date();
  const end = buildPeriodEnd(start, args.planId, args.billingPeriod);
  const price =
    args.price ??
    (tier?.isFree
      ? 0
      : args.billingPeriod === 'yearly'
        ? tier?.yearlyMonthly ?? 0
        : tier?.price ?? 0);

  return {
    planId: args.planId,
    planName: tier?.nameEn || args.planId,
    billingPeriod: args.billingPeriod,
    price,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    txHash: args.txHash,
    paymentToken: args.paymentToken,
    paymentChain: args.paymentChain,
    status: 'active',
    aiRequestsUsed: 0,
    syncPausedAt: null,
  };
}

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
        try {
          localStorage.removeItem('cryptobooks_subscription');
        } catch {
          /* ignore */
        }
      },

      markFreeTrialClaimed: () => {
        set({ freeTrialClaimed: true });
      },

      refreshExpiry: () => {
        const sub = get().subscription;
        const snap = evaluateClientSubscription(sub);
        if (sub && snap.status === 'expired' && sub.status === 'active') {
          set({
            subscription: {
              ...sub,
              status: 'expired',
              syncPausedAt: sub.syncPausedAt ?? new Date().toISOString(),
            },
          });
        }
        return evaluateClientSubscription(get().subscription);
      },

      isActive: () => evaluateClientSubscription(get().subscription).entitled,

      getEntitlement: () => {
        get().refreshExpiry();
        return evaluateClientSubscription(get().subscription);
      },

      getPlan: () => {
        const sub = get().subscription;
        if (!sub) return null;
        return pricingTiers.find(t => t.id === sub.planId) || null;
      },

      getDaysRemaining: () => evaluateClientSubscription(get().subscription).daysRemaining,

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
