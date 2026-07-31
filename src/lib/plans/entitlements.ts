/**
 * Subscription entitlements — client-safe helpers only.
 * Server DB lookups live in `entitlements-server.ts` (must not be imported from client code).
 */

import { pricingTiers } from '@/lib/mock-data';

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Your Free Plan or subscription has ended. Upgrade to resume wallet sync and AI features.';

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  'An active plan is required. Start for free or subscribe to continue.';

export const FREE_PLAN_EXPIRED_MESSAGE =
  'Your 3-day Free Plan has ended. Upgrade to keep syncing wallets and using AI.';


export class SubscriptionEntitlementError extends Error {
  readonly status: number;

  constructor(message: string, status = 402) {
    super(message);
    this.name = 'SubscriptionEntitlementError';
    this.status = status;
  }
}

export interface EntitlementSnapshot {
  entitled: boolean;
  planId: string;
  status: 'active' | 'expired' | 'none';
  endDate: string | null;
  daysRemaining: number;
  reason: string | null;
}

function daysRemaining(endDate: string | null): number {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function planPeriodDays(planId: string, billingPeriod: 'monthly' | 'yearly'): number {
  const tier = pricingTiers.find(t => t.id === planId);
  if (tier?.isFree) return tier.trialDays ?? 3;
  return billingPeriod === 'yearly' ? 365 : 30;
}

export function buildPeriodEnd(
  start: Date,
  planId: string,
  billingPeriod: 'monthly' | 'yearly',
): Date {
  return new Date(start.getTime() + planPeriodDays(planId, billingPeriod) * 86_400_000);
}

/** Client-side entitlement from the subscription store shape. */
export function evaluateClientSubscription(sub: {
  planId: string;
  status: string;
  endDate: string;
} | null): EntitlementSnapshot {
  if (!sub) {
    return {
      entitled: false,
      planId: 'starter',
      status: 'none',
      endDate: null,
      daysRemaining: 0,
      reason: SUBSCRIPTION_REQUIRED_MESSAGE,
    };
  }

  const end = new Date(sub.endDate);
  const active = sub.status === 'active' && end.getTime() > Date.now();
  if (active) {
    return {
      entitled: true,
      planId: sub.planId,
      status: 'active',
      endDate: sub.endDate,
      daysRemaining: daysRemaining(sub.endDate),
      reason: null,
    };
  }

  return {
    entitled: false,
    planId: sub.planId,
    status: 'expired',
    endDate: sub.endDate,
    daysRemaining: 0,
    reason:
      sub.planId === 'free' ? FREE_PLAN_EXPIRED_MESSAGE : SUBSCRIPTION_EXPIRED_MESSAGE,
  };
}

/** Canonical wallet-store plan id from a pricing tier id. */
export function toWalletPlanId(planId: string): string {
  if (planId === 'enterprise') return 'business';
  return planId;
}

/** Canonical pricing-tier id (Business product is `enterprise` in pricingTiers). */
export function toPricingTierId(planId: string | null | undefined): string {
  const p = (planId || 'starter').toLowerCase().trim();
  if (p === 'business') return 'enterprise';
  if (p === 'trial') return 'free';
  if (p === 'basic') return 'starter';
  return p;
}

/** Shared helper for server entitlement evaluation from raw DB fields. */
export function snapshotFromSubscriptionRow(sub: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}): EntitlementSnapshot {
  const endDate = sub.current_period_end ?? null;
  const active =
    sub.status === 'active' &&
    typeof endDate === 'string' &&
    new Date(endDate).getTime() > Date.now();

  if (active) {
    return {
      entitled: true,
      planId: toPricingTierId(sub.plan || 'starter'),
      status: 'active',
      endDate,
      daysRemaining: daysRemaining(endDate),
      reason: null,
    };
  }

  return {
    entitled: false,
    planId: toPricingTierId(sub.plan || 'starter'),
    status: 'expired',
    endDate,
    daysRemaining: 0,
    reason:
      toPricingTierId(sub.plan) === 'free'
        ? FREE_PLAN_EXPIRED_MESSAGE
        : SUBSCRIPTION_EXPIRED_MESSAGE,
  };
}

export function snapshotFromProfilePlan(plan: string): EntitlementSnapshot {
  return {
    entitled: true,
    planId: plan,
    status: 'active',
    endDate: null,
    daysRemaining: 0,
    reason: null,
  };
}

export function snapshotNone(): EntitlementSnapshot {
  return {
    entitled: false,
    planId: 'starter',
    status: 'none',
    endDate: null,
    daysRemaining: 0,
    reason: SUBSCRIPTION_REQUIRED_MESSAGE,
  };
}
