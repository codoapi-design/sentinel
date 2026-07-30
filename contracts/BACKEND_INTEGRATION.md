# Backend integration — `PaymentReceived` → Supabase activation

The smart contract **cannot** write to Supabase. After a successful on-chain payment, a trusted backend process must:

1. Observe `PaymentReceived`
2. Map `userId` / `planId` back to app entities
3. Activate the subscription for **30 days** from payment time
4. Align referral accounting with existing rules in [`src/lib/referrals/core.ts`](../src/lib/referrals/core.ts)

This document is the integration contract for the next implementation step (API + indexer). It does not change app runtime yet.

## Event ABI (listen for this)

```text
event PaymentReceived(
  bytes32 indexed userId,
  address indexed payer,
  bytes32 indexed planId,
  address paymentToken,
  uint256 amount,
  address referrer,
  uint256 treasuryAmount,
  uint256 referrerAmount,
  uint256 intentNonce
)
```

## Recommended pipeline

```text
User pays on-chain
  → Indexer / Alchemy webhook / cron poller receives PaymentReceived
  → Verify: tx success, contract address, chainId, token allowlist, amount > 0
  → Resolve user: userId == keccak256(uuid)
  → Resolve plan: planId == keccak256("starter"|"pro"|"business")
  → Idempotency: skip if intentNonce already applied for that userId
  → Update user_profiles.plan + subscriptions period (start=now, end=now+30d)
  → Call processReferralPaidConversion (existing) for off-chain reward rules
  → Store txHash + chainId + paymentToken on the subscription row
```

## Mapping helpers (TypeScript sketch)

```ts
import { keccak256, toBytes, stringToBytes } from 'viem';

export function onChainUserId(supabaseUserId: string): `0x${string}` {
  return keccak256(stringToBytes(supabaseUserId));
}

export function onChainPlanId(planId: 'starter' | 'pro' | 'business'): `0x${string}` {
  return keccak256(stringToBytes(planId));
}
```

Use the same hashing when **signing** PaymentIntents and when **indexing** events.

## EIP-712 signing (backend)

Domain:

```ts
{
  name: 'RadareumSubscriptionPayments',
  version: '2',
  chainId: <network chain id>,
  verifyingContract: <deployed contract address>,
}
```

Types:

```ts
PaymentIntent: [
  { name: 'userId', type: 'bytes32' },
  { name: 'planId', type: 'bytes32' },
  { name: 'paymentToken', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'payer', type: 'address' }, // connected wallet; must == msg.sender on-chain
  { name: 'referrer', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]
```

### Referrer field rules (must match DB)

| DB state | `referrer` in intent |
|----------|----------------------|
| User attributed + referrer joined program with payout wallet | That EVM payout wallet |
| No attribution / expired commission window / fraud blocked | `address(0)` → **100% treasury** on-chain |

On-chain split is mechanical (10%/90%). Keep eligibility checks in the signer service so ineligible users never get a non-zero referrer in the intent.

**Critical:** never sign a `referrer` that belongs to the same person as `payer` (multi-wallet self-referral). The contract can only block `referrer == payer` on the same address.

### Payer rules

- `payer` = the user's connected EVM address that will call `paySubscription`.
- Do not leave `payer` blank or equal to `address(0)`.
- Prefer exact allowance (`approve(amount)`) over unlimited allowance when possible.

### Amount rules

- Source of truth: [`pricingTiers`](../src/lib/mock-data.ts) (e.g. Pro `$39` → `39000000` for 6-decimal USDC).
- Never trust client-supplied price when signing.
- Prefer short `deadline` (e.g. 10–15 minutes).

## DB updates (align with existing API)

Reuse the period semantics from [`src/app/api/subscription/route.ts`](../src/app/api/subscription/route.ts):

- `subscriptions.status = 'active'`
- `current_period_start = payment timestamp`
- `current_period_end = start + 30 days` (monthly paid plans)
- `user_profiles.plan = toWalletPlanId(planId)`
- Persist `txHash`, `paymentToken`, `paymentChain`

Idempotency key suggestion: `(chainId, txHash, logIndex)` or `(userId, intentNonce)`.

## Security for the indexer

- Only accept events from **your** deployed contract addresses (per chain allowlist).
- Re-read the receipt; do not trust webhook body alone.
- Confirm `paymentToken` is still allowlisted.
- Confirm recovered signer of the original intent path is irrelevant post-chain; the event is authoritative for amounts already moved.
- Still call `processReferralPaidConversion` for activation rewards / caps; on-chain transfer already moved the 10% USDC/USDT.

## Suggested next API surfaces (not implemented yet)

| Route | Role |
|-------|------|
| `POST /api/payments/intent` | Auth user → build+sign PaymentIntent |
| `POST /api/payments/confirm` or webhook | Index `PaymentReceived` → activate plan |
| Env | `PAYMENT_SIGNER_PRIVATE_KEY`, `PAYMENT_CONTRACT_<CHAIN_ID>` |

## Env placeholders

```bash
PAYMENT_SIGNER_PRIVATE_KEY=   # private key of on-chain paymentSigner (never commit)
PAYMENT_CONTRACT_1=0x391b88351974592A8f5e1cc1B87e7D6B2EAeEA6c
NEXT_PUBLIC_PAYMENT_CONTRACT_1=0x391b88351974592A8f5e1cc1B87e7D6B2EAeEA6c
PAYMENT_CONTRACT_8453=        # Base (when deployed)
PAYMENT_TREASURY=0x056105E17F747d6006191bc401968a95D19e7F62
```

Implemented routes:

| Route | Role |
|-------|------|
| `POST /api/payments/intent` | Auth user → build+sign PaymentIntent |
| `POST /api/payments/confirm` | Verify `PaymentReceived` on-chain → activate plan |
