/**
 * On-chain activity labels — explorer-style (Etherscan / Basescan / etc.).
 * Separate from accounting classification (Income / Expense / Trade / …).
 */

/** Canonical labels used for column filters (plus any dynamic method names in data). */
export const ON_CHAIN_ACTIVITY_LABELS = [
  'Receive',
  'Transfer',
  'Swap',
  'Approve',
  'Bridge',
  'Stake',
  'Unstake',
  'Claim',
  'Deposit',
  'Withdraw',
  'Borrow',
  'Repay',
  'Mint',
  'Burn',
  'Multicall',
  'NFT',
  'Contract Interaction',
  'Failed',
] as const;

export type OnChainActivityLabel = (typeof ON_CHAIN_ACTIVITY_LABELS)[number];

export interface OnChainActivityInput {
  direction?: string | null;
  methodId?: string | null;
  methodName?: string | null;
  /** Accounting / Radareum classification */
  type?: string | null;
  statusFailed?: boolean;
}

/** Human labels matching common block explorer “Method / Txn Type” wording */
export function resolveOnChainActivity(input: OnChainActivityInput): string {
  if (input.statusFailed) return 'Failed';

  const methodId = (input.methodId || '').toLowerCase();
  const rawName = (input.methodName || '').trim();
  const name = rawName.toLowerCase();
  const direction = (input.direction || '').toLowerCase();
  const type = (input.type || '').toLowerCase();

  // Explicit method-name heuristics (explorer-friendly titles)
  if (name) {
    if (name.includes('swap') || name.includes('exactinput') || name.includes('exactoutput') || name.includes('fillorder')) {
      return 'Swap';
    }
    if (name === 'transfer' || name === 'transferfrom') {
      return direction === 'in' ? 'Receive' : 'Transfer';
    }
    if (name.includes('approve')) return 'Approve';
    if (name.includes('multicall')) return 'Multicall';
    if (name.includes('bridge') || name.includes('sendmessage') || name.includes('depositeth') || name.includes('finalize')) {
      return 'Bridge';
    }
    if (name.includes('stake') || name.includes('delegate')) return 'Stake';
    if (name.includes('unstake') || name.includes('undelegate') || name.includes('withdraw')) {
      if (name.includes('reward') || name.includes('claim')) return 'Claim';
      return name.includes('unstake') || name.includes('undelegate') ? 'Unstake' : 'Withdraw';
    }
    if (name.includes('claim') || name.includes('getreward') || name.includes('harvest')) return 'Claim';
    if (name.includes('deposit') || name.includes('supply')) return 'Deposit';
    if (name.includes('borrow')) return 'Borrow';
    if (name.includes('repay')) return 'Repay';
    if (name.includes('mint')) return 'Mint';
    if (name.includes('burn')) return 'Burn';
    if (name.includes('execute') || name.includes('exectransaction')) return 'Contract Interaction';

    // Prefer the decoded method name itself (Title Case) when recognizable
    if (/^[a-z][a-zA-Z0-9]*$/.test(rawName) || /^[A-Za-z]/.test(rawName)) {
      return formatMethodLabel(rawName);
    }
  }

  // Common selectors when name is missing
  if (methodId === '0xa9059cbb' || methodId === '0x23b872dd') {
    return direction === 'in' ? 'Receive' : 'Transfer';
  }
  if (methodId === '0x095ea7b3') return 'Approve';
  if (methodId === '0x5f575529') return 'Swap';

  // Non-empty unknown selector → contract interaction (not a wallet Send Transfer)
  if (methodId && methodId !== '0x') {
    if (type === 'trade') return 'Swap';
    if (type === 'bridge') return 'Bridge';
    if (type === 'staking') return 'Claim';
    if (type === 'nft') return 'NFT';
    if (type === 'defi') return 'Contract Interaction';
    return 'Contract Interaction';
  }

  // Fall back by accounting type / direction (still explorer-like wording)
  if (type === 'trade') return 'Swap';
  if (type === 'bridge') return 'Bridge';
  if (type === 'staking') return 'Claim';
  if (type === 'gas') return 'Contract Interaction';
  if (type === 'nft') return 'NFT';
  if (type === 'defi') return 'Contract Interaction';
  if (direction === 'in' || type === 'income') return 'Receive';
  if (direction === 'out' || type === 'expense') return 'Transfer';

  return 'Contract Interaction';
}

function formatMethodLabel(methodName: string): string {
  // swapExactTokensForTokens → Swap Exact Tokens For Tokens
  const spaced = methodName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
  return spaced
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
