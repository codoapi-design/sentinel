/**
 * Plan → address-family entitlements.
 *
 * Free:      EVM only (3-day trial)
 * Starter:   EVM only
 * Pro:       EVM + Solana + Tron
 * Business:  EVM + Solana + Tron + Bitcoin
 *            (DB plan id may be `enterprise` or `business`)
 */

export type AddressFamily = 'evm' | 'solana' | 'tron' | 'bitcoin';

export type PlanId = 'free' | 'starter' | 'pro' | 'business' | 'enterprise';

const ALL_FAMILIES: AddressFamily[] = ['evm', 'solana', 'tron', 'bitcoin'];

/** Canonical entitlements by product tier */
export const PLAN_ADDRESS_FAMILIES: Record<'free' | 'starter' | 'pro' | 'business', AddressFamily[]> = {
  free: ['evm'],
  starter: ['evm'],
  pro: ['evm', 'solana', 'tron'],
  business: ['evm', 'solana', 'tron', 'bitcoin'],
};

/** Human labels for UI */
export const ADDRESS_FAMILY_LABELS: Record<AddressFamily, string> = {
  evm: 'EVM',
  solana: 'Solana',
  tron: 'Tron',
  bitcoin: 'Bitcoin',
};

/** Network chips shown in Add Wallet for each family */
export const ADDRESS_FAMILY_NETWORK_CHIPS: Record<AddressFamily, string[]> = {
  evm: ['Ethereum', 'Base', 'Arbitrum', 'OP', 'Polygon', 'BSC', 'Linea', 'HyperEVM', 'Monad'],
  solana: ['Solana'],
  tron: ['Tron'],
  bitcoin: ['Bitcoin'],
};

/**
 * Normalize plan strings from DB / store.
 * `enterprise` is treated as Business (full address families).
 * `free` keeps its own id (same address families as Starter).
 */
export function normalizePlanId(
  plan: string | null | undefined,
): 'free' | 'starter' | 'pro' | 'business' {
  const p = (plan || 'starter').toLowerCase().trim();
  if (p === 'free' || p === 'trial') return 'free';
  if (p === 'pro') return 'pro';
  if (p === 'business' || p === 'enterprise') return 'business';
  if (p === 'basic') return 'starter';
  return 'starter';
}

export function getAllowedAddressFamilies(plan: string | null | undefined): AddressFamily[] {
  return PLAN_ADDRESS_FAMILIES[normalizePlanId(plan)];
}

export function planAllowsAddressFamily(
  plan: string | null | undefined,
  family: AddressFamily,
): boolean {
  return getAllowedAddressFamilies(plan).includes(family);
}

export function filterAddressesByPlan(
  plan: string | null | undefined,
  addresses: {
    evmAddress?: string | null;
    solanaAddress?: string | null;
    tronAddress?: string | null;
    bitcoinAddress?: string | null;
  },
): {
  evmAddress: string | null;
  solanaAddress: string | null;
  tronAddress: string | null;
  bitcoinAddress: string | null;
  rejected: AddressFamily[];
} {
  const allowed = new Set(getAllowedAddressFamilies(plan));
  const rejected: AddressFamily[] = [];

  const pick = (family: AddressFamily, value: string | null | undefined): string | null => {
    const v = value?.trim() || null;
    if (!v) return null;
    if (!allowed.has(family)) {
      rejected.push(family);
      return null;
    }
    return v;
  };

  return {
    evmAddress: pick('evm', addresses.evmAddress),
    solanaAddress: pick('solana', addresses.solanaAddress),
    tronAddress: pick('tron', addresses.tronAddress),
    bitcoinAddress: pick('bitcoin', addresses.bitcoinAddress),
    rejected,
  };
}

/** Reject if user submitted a family their plan does not include */
export function assertAddressesAllowedForPlan(
  plan: string | null | undefined,
  addresses: {
    evmAddress?: string | null;
    solanaAddress?: string | null;
    tronAddress?: string | null;
    bitcoinAddress?: string | null;
  },
): { ok: true } | { ok: false; error: string } {
  const { rejected } = filterAddressesByPlan(plan, addresses);
  if (rejected.length === 0) return { ok: true };

  const tier = normalizePlanId(plan);
  const labels = rejected.map(f => ADDRESS_FAMILY_LABELS[f]).join(', ');
  const allowed = getAllowedAddressFamilies(plan)
    .map(f => ADDRESS_FAMILY_LABELS[f])
    .join(', ');

  return {
    ok: false,
    error: `${labels} ${rejected.length === 1 ? 'is' : 'are'} not available on the ${tierLabel(tier)} plan. Allowed: ${allowed}. Upgrade to unlock.`,
  };
}

export function tierLabel(plan: string | null | undefined): string {
  const t = normalizePlanId(plan);
  if (t === 'free') return 'Free Plan';
  if (t === 'pro') return 'Pro';
  if (t === 'business') return 'Business';
  return 'Starter';
}

export function planDisplayName(plan: string | null | undefined): string {
  return tierLabel(plan);
}

/** Starter requires an EVM address; higher tiers need at least one allowed address */
export function assertPlanAddressRequirements(
  plan: string | null | undefined,
  addresses: {
    evmAddress?: string | null;
    solanaAddress?: string | null;
    tronAddress?: string | null;
    bitcoinAddress?: string | null;
  },
): { ok: true } | { ok: false; error: string } {
  const tier = normalizePlanId(plan);
  const filtered = filterAddressesByPlan(plan, addresses);

  if (tier === 'starter' || tier === 'free') {
    if (!filtered.evmAddress) {
      return {
        ok: false,
        error: `${tierLabel(tier)} requires an EVM wallet address`,
      };
    }
    return { ok: true };
  }

  if (
    !filtered.evmAddress &&
    !filtered.solanaAddress &&
    !filtered.tronAddress &&
    !filtered.bitcoinAddress
  ) {
    return {
      ok: false,
      error: `Enter at least one address allowed on ${tierLabel(tier)} (${getAllowedAddressFamilies(plan)
        .map(f => ADDRESS_FAMILY_LABELS[f])
        .join(', ')})`,
    };
  }

  return { ok: true };
}

export function networkChipsForPlan(plan: string | null | undefined): string[] {
  return getAllowedAddressFamilies(plan).flatMap(f => ADDRESS_FAMILY_NETWORK_CHIPS[f]);
}

export { ALL_FAMILIES };
