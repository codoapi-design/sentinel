/**
 * Canonical AI history / analysis entitlement resolver.
 * Reads existing plan limits; does not invent product tiers.
 */

import { normalizePlanId } from '@/lib/plans/address-families';
import { getPlanLimits, PLAN_LIMITS } from '@/lib/plans/limits';

type PlanId = ReturnType<typeof normalizePlanId>;

export interface AiHistoryEntitlement {
  plan: PlanId;
  /** Earliest ISO timestamp accessible for analysis; null = unbounded past. */
  allowedFrom: string | null;
  /** Latest ISO timestamp accessible; usually "now". */
  allowedTo: string;
  /** True when the plan permits entitled full-history analysis. */
  fullHistoryPermitted: boolean;
  /** True when durable async full-history jobs are available. */
  asyncFullHistoryAvailable: boolean;
  /** Max retained transactions for the plan (Infinity → null). */
  maxTransactions: number | null;
  /** Lookback days when history is period-capped; null = unbounded. */
  historyDays: number | null;
  allowedAnalysisTypes: string[];
  limitations: string[];
}

/** Period lookback derived from existing retention / tier intent. */
const HISTORY_DAYS_BY_PLAN: Record<PlanId, number | null> = {
  // Free: trial — short lookback aligns with limited retention (100 txs).
  free: 30,
  // Starter: up to 1,500 txs — one year lookback.
  starter: 365,
  // Pro / Business: unlimited history.
  pro: null,
  business: null,
};

const ASYNC_BY_PLAN: Record<PlanId, boolean> = {
  free: false,
  starter: false,
  pro: true,
  business: true,
};

const ANALYSIS_TYPES_BY_PLAN: Record<PlanId, string[]> = {
  free: ['holdings', 'allocation', 'flow_basic', 'asset'],
  starter: ['holdings', 'allocation', 'flow', 'asset', 'trading', 'network', 'counterparty', 'risk'],
  pro: [
    'holdings',
    'allocation',
    'flow',
    'asset',
    'trading',
    'network',
    'counterparty',
    'risk',
    'performance',
    'full_history',
    'executive',
  ],
  business: [
    'holdings',
    'allocation',
    'flow',
    'asset',
    'trading',
    'network',
    'counterparty',
    'risk',
    'performance',
    'full_history',
    'executive',
  ],
};

export function resolveAiHistoryEntitlement(input: {
  plan: string | null | undefined;
  now?: number;
  walletConnectedAt?: string | null;
}): AiHistoryEntitlement {
  const plan = normalizePlanId(input.plan);
  const now = input.now ?? Date.now();
  const allowedTo = new Date(now).toISOString();
  const historyDays = HISTORY_DAYS_BY_PLAN[plan];
  const limits = getPlanLimits(plan);
  const maxTx = Number.isFinite(limits.transactions) ? limits.transactions : null;

  let allowedFrom: string | null = null;
  const limitations: string[] = [];

  if (historyDays != null) {
    const fromMs = now - historyDays * 24 * 60 * 60 * 1000;
    allowedFrom = new Date(fromMs).toISOString();
    limitations.push(
      `${plan} plan AI history is limited to the last ${historyDays} days.`,
    );
  }

  if (input.walletConnectedAt) {
    const connectedMs = Date.parse(input.walletConnectedAt);
    if (Number.isFinite(connectedMs)) {
      const connectedIso = new Date(connectedMs).toISOString();
      if (!allowedFrom || connectedMs > Date.parse(allowedFrom)) {
        // Entitled history cannot begin before wallet connect.
        if (!allowedFrom) {
          // unbounded plan still starts at connect for "full entitled"
          allowedFrom = null;
        } else if (connectedMs > Date.parse(allowedFrom)) {
          allowedFrom = connectedIso;
        }
      }
    }
  }

  if (maxTx != null) {
    limitations.push(
      `${plan} plan retains up to ${maxTx.toLocaleString('en-US')} non-spam transactions per wallet.`,
    );
  }

  const fullHistoryPermitted = historyDays == null && (maxTx == null || maxTx === Infinity);
  const asyncFullHistoryAvailable = ASYNC_BY_PLAN[plan] && fullHistoryPermitted;

  if (!asyncFullHistoryAvailable && fullHistoryPermitted === false) {
    limitations.push('Async full-history analysis is not available on this plan.');
  }

  return {
    plan,
    allowedFrom,
    allowedTo,
    fullHistoryPermitted,
    asyncFullHistoryAvailable,
    maxTransactions: maxTx === Infinity ? null : maxTx,
    historyDays,
    allowedAnalysisTypes: ANALYSIS_TYPES_BY_PLAN[plan],
    limitations,
  };
}

export interface PeriodIntersection {
  from: string;
  to: string;
  clipped: boolean;
  denied: boolean;
  reason?: string;
  requestedFrom: string;
  requestedTo: string;
}

/**
 * Intersect a client-requested period with entitlement scope.
 * Policy: clip into allowed window when partial overlap; deny when no overlap.
 */
export function intersectPeriodWithEntitlement(
  requested: { from: string; to: string },
  entitlement: AiHistoryEntitlement,
): PeriodIntersection {
  const reqFrom = Date.parse(requested.from);
  const reqTo = Date.parse(requested.to);
  const entFrom = entitlement.allowedFrom ? Date.parse(entitlement.allowedFrom) : null;
  const entTo = Date.parse(entitlement.allowedTo);

  if (!Number.isFinite(reqFrom) || !Number.isFinite(reqTo) || !Number.isFinite(entTo)) {
    return {
      from: requested.from,
      to: requested.to,
      clipped: false,
      denied: true,
      reason: 'Invalid period timestamps.',
      requestedFrom: requested.from,
      requestedTo: requested.to,
    };
  }

  const effectiveFrom = entFrom == null ? reqFrom : Math.max(reqFrom, entFrom);
  const effectiveTo = Math.min(reqTo, entTo);

  if (effectiveFrom > effectiveTo) {
    return {
      from: requested.from,
      to: requested.to,
      clipped: false,
      denied: true,
      reason:
        'Requested period is outside the subscription history entitlement. Upgrade or choose a shorter period.',
      requestedFrom: requested.from,
      requestedTo: requested.to,
    };
  }

  const clipped =
    effectiveFrom !== reqFrom || effectiveTo !== reqTo || (entFrom != null && reqFrom < entFrom);

  return {
    from: new Date(effectiveFrom).toISOString(),
    to: new Date(effectiveTo).toISOString(),
    clipped,
    denied: false,
    reason: clipped
      ? 'Requested period was clipped to the subscription-entitled history window.'
      : undefined,
    requestedFrom: requested.from,
    requestedTo: requested.to,
  };
}

export function planSupportsAnalysisType(
  entitlement: AiHistoryEntitlement,
  analysisType: string,
): boolean {
  return entitlement.allowedAnalysisTypes.includes(analysisType);
}

/** Expose for tests / docs — mirrors PLAN_LIMITS keys. */
export function documentedHistoryDays(): Record<string, number | null> {
  return { ...HISTORY_DAYS_BY_PLAN, starter_tx_cap: PLAN_LIMITS.starter.transactions };
}
