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
  paymentToken: 'USDC' | 'USDT';
  paymentChain: number;
  status: 'active' | 'expired' | 'cancelled';
}

interface SubscriptionState {
  subscription: Subscription | null;
  setSubscription: (sub: Subscription) => void;
  clearSubscription: () => void;
  isActive: () => boolean;
  getPlan: () => PricingTier | null;
  getDaysRemaining: () => number;
  getPlanLimits: () => {
    wallets: number;
    networks: number;
    transactions: number;
    aiChats: number;
    syncInterval: string;
  } | null;
}

// ============================================================
// Store
// ============================================================

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      subscription: null,

      setSubscription: (sub: Subscription) => {
        set({ subscription: sub });
      },

      clearSubscription: () => {
        set({ subscription: null });
        localStorage.removeItem('cryptobooks_subscription');
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
