/**
 * Canonical plan limits — shared by client store, APIs, and sync gates.
 * Keep in sync with `pricingTiers` in mock-data.
 */

import { normalizePlanId } from '@/lib/plans/address-families';

export interface PlanLimits {
  wallets: number;
  networks: number;
  /** Max non-spam transactions retained per wallet. Infinity = unlimited. */
  transactions: number;
  syncIntervalMs: number;
  /** Shared AI request cap; `null` = unlimited. */
  aiRequests: number | null;
}

export const PLAN_LIMITS: Record<
  'free' | 'starter' | 'pro' | 'business',
  PlanLimits
> = {
  free: {
    wallets: 1,
    networks: 1,
    transactions: 100,
    syncIntervalMs: 600_000, // 10 minutes
    aiRequests: 50,
  },
  starter: {
    wallets: 2,
    networks: 1,
    transactions: 1500,
    syncIntervalMs: 900_000, // 15 minutes
    aiRequests: 150,
  },
  pro: {
    wallets: 5,
    networks: 5,
    transactions: Infinity,
    syncIntervalMs: 300_000, // 5 minutes
    aiRequests: 1000,
  },
  business: {
    wallets: Infinity,
    networks: 10,
    transactions: Infinity,
    syncIntervalMs: 30_000, // 30 seconds
    aiRequests: null,
  },
};

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[normalizePlanId(planId)];
}

export function getWalletLimit(planId: string | null | undefined): number {
  return getPlanLimits(planId).wallets;
}

export function getTransactionLimit(planId: string | null | undefined): number {
  return getPlanLimits(planId).transactions;
}

export function getSyncIntervalMs(planId: string | null | undefined): number {
  return getPlanLimits(planId).syncIntervalMs;
}
