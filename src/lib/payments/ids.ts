import { keccak256, stringToBytes, type Hex } from 'viem';

/** App plan ids → on-chain plan label (enterprise → business). */
export function onChainPlanLabel(planId: string): string {
  if (planId === 'enterprise') return 'business';
  return planId;
}

export function onChainUserId(supabaseUserId: string): Hex {
  return keccak256(stringToBytes(supabaseUserId));
}

export function onChainPlanId(planId: string): Hex {
  return keccak256(stringToBytes(onChainPlanLabel(planId)));
}

/** Convert a USD price to token base units without float drift (cents → decimals). */
export function usdToTokenAmount(usd: number, decimals: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) throw new Error('Invalid USD amount');
  if (decimals < 2) throw new Error('Unsupported token decimals');
  const cents = Math.round(usd * 100);
  return BigInt(cents) * BigInt(10) ** BigInt(decimals - 2);
}

export function tokenDecimalsFor(chainId: number, symbol: 'USDC' | 'USDT'): number {
  if (symbol === 'USDC') return 6;
  // USDT is 18 on BSC; 6 on Ethereum / most L2s we care about for payments.
  if (chainId === 56) return 18;
  return 6;
}
