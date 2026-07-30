/**
 * Alert catalog + plan gating for Telegram / Email notification settings.
 *
 * Tiers:
 *   basic    → Free (partial) + Starter
 *   advanced → Pro (+ Business)
 *   instant  → Business only
 */

import { normalizePlanId, planDisplayName } from '@/lib/plans/address-families';

export type AlertTier = 'basic' | 'advanced' | 'instant';
export type AlertChannel = 'telegram' | 'email';

export type AlertKey =
  // Basic
  | 'inboundAbove'
  | 'outboundAbove'
  | 'portfolioReaches'
  | 'assetRises'
  | 'assetDrops'
  | 'gasExceeds'
  | 'dailySummary'
  | 'weeklyReport'
  | 'monthlyReport'
  // Advanced
  | 'multiAssetMoves'
  | 'namedClientTransfer'
  | 'unknownAddress'
  | 'tradingVolumeSpike'
  | 'netFlowDaily'
  | 'pnlThreshold'
  | 'portfolioConcentration'
  | 'dormancyBreak'
  | 'gasWeekly'
  | 'stakingRewards'
  // Instant
  | 'instantLargeTransfer'
  | 'tokenApprovalRisk'
  | 'defiHealthFactor'
  | 'spamTokenDetected'
  | 'syncFailure';

export interface AlertDefinition {
  key: AlertKey;
  tier: AlertTier;
  /** Minimum plan that unlocks this alert (after channel rules). */
  minPlan: 'free' | 'starter' | 'pro' | 'business';
  title: string;
  description: string;
  channels: AlertChannel[];
}

const PLAN_RANK: Record<'free' | 'starter' | 'pro' | 'business', number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
};

export const ALERT_TIER_META: Record<
  AlertTier,
  { label: string; shortLabel: string; badgePlan: string; accent: string; accentBg: string }
> = {
  basic: {
    label: 'Basic alerts',
    shortLabel: 'Basic',
    badgePlan: 'Starter',
    accent: 'text-[#0ecb81]',
    accentBg: 'bg-[#0ecb81]/10',
  },
  advanced: {
    label: 'Advanced custom alerts',
    shortLabel: 'Advanced',
    badgePlan: 'Pro',
    accent: 'text-[#0052ff]',
    accentBg: 'bg-[#0052ff]/10',
  },
  instant: {
    label: 'Instant alerts',
    shortLabel: 'Instant',
    badgePlan: 'Business',
    accent: 'text-[#f7931a]',
    accentBg: 'bg-[#f7931a]/10',
  },
};

/** Short list of assets for Basic tier. */
export const BASIC_ALERT_ASSETS = ['ETH', 'BTC', 'USDC', 'USDT'] as const;

export const ALERT_CATALOG: AlertDefinition[] = [
  // ── Basic ──────────────────────────────────────────────
  {
    key: 'inboundAbove',
    tier: 'basic',
    minPlan: 'free',
    title: 'Incoming transfers above',
    description: 'Alert when receiving above a USD threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'outboundAbove',
    tier: 'basic',
    minPlan: 'free',
    title: 'Outgoing transfers above',
    description: 'Alert when sending above a USD threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'portfolioReaches',
    tier: 'basic',
    minPlan: 'free',
    title: 'When wallet reaches',
    description: 'Alert when total portfolio value hits a target',
    channels: ['telegram', 'email'],
  },
  {
    key: 'assetRises',
    tier: 'basic',
    minPlan: 'free',
    title: 'When an asset rises by',
    description: 'Price rise alert for a core asset',
    channels: ['telegram', 'email'],
  },
  {
    key: 'assetDrops',
    tier: 'basic',
    minPlan: 'free',
    title: 'When an asset drops by',
    description: 'Price drop alert for a core asset',
    channels: ['telegram', 'email'],
  },
  {
    key: 'gasExceeds',
    tier: 'basic',
    minPlan: 'free',
    title: 'Gas fees exceed',
    description: 'Daily gas spend above a USD threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'dailySummary',
    tier: 'basic',
    minPlan: 'free',
    title: 'Daily summary at',
    description: 'Scheduled daily wallet snapshot',
    channels: ['telegram', 'email'],
  },
  {
    key: 'weeklyReport',
    tier: 'basic',
    minPlan: 'starter',
    title: 'Weekly report every',
    description: 'Weekly activity, inflow, and outflow report',
    channels: ['telegram', 'email'],
  },
  {
    key: 'monthlyReport',
    tier: 'basic',
    minPlan: 'starter',
    title: 'Monthly report on day',
    description: 'Monthly portfolio and cash-flow summary',
    channels: ['telegram', 'email'],
  },

  // ── Advanced ───────────────────────────────────────────
  {
    key: 'multiAssetMoves',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Any holding moves by',
    description: 'Watch multiple holdings for % moves (custom list)',
    channels: ['telegram', 'email'],
  },
  {
    key: 'namedClientTransfer',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Named client activity',
    description: 'Alert on transfers with a named client',
    channels: ['telegram', 'email'],
  },
  {
    key: 'unknownAddress',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'New unknown address',
    description: 'First interaction with an unlabeled counterparty',
    channels: ['telegram', 'email'],
  },
  {
    key: 'tradingVolumeSpike',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Trading volume spike',
    description: 'Daily trading volume exceeds your threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'netFlowDaily',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Net flow turns negative',
    description: 'Daily net cash-flow drops below a threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'pnlThreshold',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'P&L crosses',
    description: 'Realized / unrealized P&L hits a USD limit',
    channels: ['telegram', 'email'],
  },
  {
    key: 'portfolioConcentration',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Asset concentration above',
    description: 'One holding exceeds a % of the portfolio',
    channels: ['telegram', 'email'],
  },
  {
    key: 'dormancyBreak',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Activity after dormancy',
    description: 'First transfer after several quiet days',
    channels: ['telegram', 'email'],
  },
  {
    key: 'gasWeekly',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Weekly gas exceeds',
    description: 'Cumulative weekly gas above a USD threshold',
    channels: ['telegram', 'email'],
  },
  {
    key: 'stakingRewards',
    tier: 'advanced',
    minPlan: 'pro',
    title: 'Staking rewards received',
    description: 'Notify when staking / yield rewards land',
    channels: ['telegram', 'email'],
  },

  // ── Instant (Business) ─────────────────────────────────
  {
    key: 'instantLargeTransfer',
    tier: 'instant',
    minPlan: 'business',
    title: 'Instant large transfer',
    description: 'Near real-time push for large in/out transfers',
    channels: ['telegram', 'email'],
  },
  {
    key: 'tokenApprovalRisk',
    tier: 'instant',
    minPlan: 'business',
    title: 'Risky token approval',
    description: 'Unlimited or high-risk spender approvals',
    channels: ['telegram', 'email'],
  },
  {
    key: 'defiHealthFactor',
    tier: 'instant',
    minPlan: 'business',
    title: 'DeFi health factor critical',
    description: 'Position health factor drops below your floor',
    channels: ['telegram', 'email'],
  },
  {
    key: 'spamTokenDetected',
    tier: 'instant',
    minPlan: 'business',
    title: 'Spam token detected',
    description: 'New spam / dust token appears in the wallet',
    channels: ['telegram', 'email'],
  },
  {
    key: 'syncFailure',
    tier: 'instant',
    minPlan: 'business',
    title: 'Sync failure',
    description: 'Wallet sync fails or falls critically behind',
    channels: ['telegram', 'email'],
  },
];

export function planRank(planId: string | null | undefined): number {
  return PLAN_RANK[normalizePlanId(planId)];
}

/** Email channel starts at Starter (Free = Telegram only). */
export function planAllowsAlertChannel(
  planId: string | null | undefined,
  channel: AlertChannel,
): boolean {
  const plan = normalizePlanId(planId);
  if (channel === 'email') return plan !== 'free';
  return true;
}

/**
 * Free: daily TG report only (no weekly/monthly).
 * Starter: weekly + monthly (no daily).
 * Pro / Business: daily + weekly + monthly.
 */
export function planAllowsAlert(
  planId: string | null | undefined,
  key: AlertKey,
  channel: AlertChannel,
): boolean {
  if (!planAllowsAlertChannel(planId, channel)) return false;

  const plan = normalizePlanId(planId);
  const def = ALERT_CATALOG.find(a => a.key === key);
  if (!def || !def.channels.includes(channel)) return false;

  if (key === 'dailySummary') {
    if (plan === 'free') return channel === 'telegram';
    if (plan === 'starter') return false;
    return planRank(plan) >= PLAN_RANK.pro;
  }

  if (key === 'weeklyReport' || key === 'monthlyReport') {
    return planRank(plan) >= PLAN_RANK.starter;
  }

  return planRank(plan) >= PLAN_RANK[def.minPlan];
}

export function planAllowsAlertTier(
  planId: string | null | undefined,
  tier: AlertTier,
): boolean {
  const plan = normalizePlanId(planId);
  if (tier === 'basic') return true;
  if (tier === 'advanced') return plan === 'pro' || plan === 'business';
  return plan === 'business';
}

export function upgradePlanForTier(tier: AlertTier): 'starter' | 'pro' | 'business' {
  if (tier === 'basic') return 'starter';
  if (tier === 'advanced') return 'pro';
  return 'business';
}

export function upgradeHintForAlert(
  planId: string | null | undefined,
  key: AlertKey,
  channel: AlertChannel,
): string | null {
  if (planAllowsAlert(planId, key, channel)) return null;

  if (!planAllowsAlertChannel(planId, channel)) {
    return 'Email alerts start on the Starter plan.';
  }

  if (key === 'dailySummary' && normalizePlanId(planId) === 'starter') {
    return 'Daily reports unlock on Pro (Starter includes weekly & monthly).';
  }

  const def = ALERT_CATALOG.find(a => a.key === key);
  if (!def) return 'Upgrade your plan to unlock this alert.';

  const target = upgradePlanForTier(def.tier);
  return `Available on ${planDisplayName(target)} and above. You’re on ${planDisplayName(planId)}.`;
}

export function alertsForTier(
  tier: AlertTier,
  channel: AlertChannel,
): AlertDefinition[] {
  return ALERT_CATALOG.filter(a => a.tier === tier && a.channels.includes(channel));
}

/** Shared default payloads for every alert key. */
export const defaultAlertPayloads = {
  inboundAbove: { enabled: false, amount: 1000 },
  outboundAbove: { enabled: false, amount: 500 },
  portfolioReaches: { enabled: false, amount: 80000 },
  assetRises: { enabled: false, percentage: 5, asset: 'ETH' },
  assetDrops: { enabled: false, percentage: 5, asset: 'ETH' },
  gasExceeds: { enabled: false, amount: 50 },
  dailySummary: { enabled: false, time: '09:00' },
  weeklyReport: { enabled: false, day: 'Monday' },
  monthlyReport: { enabled: false, day: 1 },
  multiAssetMoves: { enabled: false, percentage: 5 },
  namedClientTransfer: { enabled: false },
  unknownAddress: { enabled: false },
  tradingVolumeSpike: { enabled: false, amount: 10000 },
  netFlowDaily: { enabled: false, amount: -1000 },
  pnlThreshold: { enabled: false, amount: -5000 },
  portfolioConcentration: { enabled: false, percentage: 40 },
  dormancyBreak: { enabled: false, days: 7 },
  gasWeekly: { enabled: false, amount: 200 },
  stakingRewards: { enabled: false },
  instantLargeTransfer: { enabled: false, amount: 5000 },
  tokenApprovalRisk: { enabled: false },
  defiHealthFactor: { enabled: false, threshold: 1.25 },
  spamTokenDetected: { enabled: false },
  syncFailure: { enabled: false },
} as const;

export type AlertPayloads = {
  inboundAbove: { enabled: boolean; amount: number };
  outboundAbove: { enabled: boolean; amount: number };
  portfolioReaches: { enabled: boolean; amount: number };
  assetRises: { enabled: boolean; percentage: number; asset: string };
  assetDrops: { enabled: boolean; percentage: number; asset: string };
  gasExceeds: { enabled: boolean; amount: number };
  dailySummary: { enabled: boolean; time: string };
  weeklyReport: { enabled: boolean; day: string };
  monthlyReport: { enabled: boolean; day: number };
  multiAssetMoves: { enabled: boolean; percentage: number };
  namedClientTransfer: { enabled: boolean };
  unknownAddress: { enabled: boolean };
  tradingVolumeSpike: { enabled: boolean; amount: number };
  netFlowDaily: { enabled: boolean; amount: number };
  pnlThreshold: { enabled: boolean; amount: number };
  portfolioConcentration: { enabled: boolean; percentage: number };
  dormancyBreak: { enabled: boolean; days: number };
  gasWeekly: { enabled: boolean; amount: number };
  stakingRewards: { enabled: boolean };
  instantLargeTransfer: { enabled: boolean; amount: number };
  tokenApprovalRisk: { enabled: boolean };
  defiHealthFactor: { enabled: boolean; threshold: number };
  spamTokenDetected: { enabled: boolean };
  syncFailure: { enabled: boolean };
};

export function createDefaultAlertPayloads(): AlertPayloads {
  return JSON.parse(JSON.stringify(defaultAlertPayloads)) as AlertPayloads;
}

export function disableAlertPayloads(payloads: AlertPayloads): AlertPayloads {
  const next = createDefaultAlertPayloads();
  for (const key of Object.keys(next) as AlertKey[]) {
    const current = payloads[key] as Record<string, unknown>;
    next[key] = { ...current, enabled: false } as never;
  }
  return next;
}

// Keep features.ts helpers in sync
export function planAllowsAdvancedAlerts(planId: string | null | undefined): boolean {
  return planAllowsAlertTier(planId, 'advanced');
}

export function planAllowsInstantAlerts(planId: string | null | undefined): boolean {
  return planAllowsAlertTier(planId, 'instant');
}
