# Radareum Subscription Payments — Remix Deploy Guide

## Files

| File | Use |
|------|-----|
| [`RadareumSubscriptionPayments.sol`](./RadareumSubscriptionPayments.sol) | Local / Foundry / Hardhat (`@openzeppelin/contracts`) |
| [`remix/RadareumSubscriptionPayments.Remix.sol`](./remix/RadareumSubscriptionPayments.Remix.sol) | **Paste this into Remix** (OpenZeppelin **v5.2.0** GitHub imports) |

## Deployed addresses

| Chain | chainId | Contract |
|-------|---------|----------|
| Ethereum Mainnet | 1 | `0x391b88351974592A8f5e1cc1B87e7D6B2EAeEA6c` |

## Constructor arguments

```text
initialOwner          = <your admin wallet>
initialPaymentSigner  = <backend signer that will EIP-712 sign PaymentIntents>
initialTreasury       = 0x056105E17F747d6006191bc401968a95D19e7F62
initialCommissionBps  = 1000   // 10%
```

For a first mainnet test you may set `initialOwner` and `initialPaymentSigner` to the same wallet, then rotate `paymentSigner` to a dedicated hot key later.

## Remix steps (Ethereum)

1. Open [Remix](https://remix.ethereum.org).
2. Create file `RadareumSubscriptionPayments.sol` and paste contents of `remix/RadareumSubscriptionPayments.Remix.sol`.
3. Compiler: **0.8.24+**, enable optimization (200 runs recommended).
   - If Remix still reports `Stack too deep`, open **Advanced Configurations** and set `viaIR: true` (optional with this refactor; usually not needed).
4. Compile — wait until OpenZeppelin imports resolve.
5. Deploy & Run:
   - Environment: Injected Provider (MetaMask) on the target chain.
   - Contract: `RadareumSubscriptionPayments`.
   - Deploy with the four constructor args above.
6. After deploy, as `owner`, call:

```text
setTokenAllowed(USDC, true)
setTokenAllowed(USDT, true)
```

### Official token addresses (verify on each explorer before allowlisting)

#### Ethereum Mainnet

| Token | Address |
|-------|---------|
| USDC  | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| USDT  | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |

#### Base

| Token | Address |
|-------|---------|
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDT  | `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` |

#### Arbitrum One

| Token | Address |
|-------|---------|
| USDC  | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| USDT  | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |

#### Optimism

| Token | Address |
|-------|---------|
| USDC  | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| USDT  | `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58` |

#### Polygon PoS

| Token | Address |
|-------|---------|
| USDC  | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| USDT  | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |

> Deploy a **fresh** contract instance on every chain. Do not reuse one address across networks. EIP-712 domain includes `chainId` + contract address, so signatures are not portable.

## Payment flow (after deploy)

1. Backend builds `PaymentIntent` including **`payer`** (user's connected wallet), userId, planId, token, amount, referrer, nonce, deadline.
2. Backend signs EIP-712 digest with `paymentSigner` private key (**domain version `2`**).
3. User `approve`s the payment contract for `amount` of USDC/USDT **from that same `payer` wallet**.
4. User calls `paySubscription(intent, signature)` from `payer` (`msg.sender` must equal `intent.payer`).
5. Contract pulls tokens, rejects fee-on-transfer mismatches, sends **10%** to `referrer` (if non-zero) and **90%** (or **100%**) to treasury, emits `PaymentReceived`.
6. Backend indexer activates the plan in the DB for 30 days (see [`BACKEND_INTEGRATION.md`](./BACKEND_INTEGRATION.md)).

### PaymentIntent fields (v2)

```text
userId, planId, paymentToken, amount, payer, referrer, nonce, deadline
```

`payer` is part of the signed payload — another wallet cannot hijack the quote even with a copied signature.

### Plan / user id hashing (must match backend)

```text
userId = keccak256(abi.encodePacked(supabaseUserUuidString))
planId = keccak256(abi.encodePacked("starter"))  // or "pro" / "business"
```

Amounts use **token decimals** (USDC/USDT = 6 on the chains above). Example: `$39.00` Pro → `39000000`.

## Security checklist (pre-mainnet)

- [ ] Only official Circle/Tether token contracts allowlisted
- [ ] `paymentSigner` is a dedicated key; private key never in frontend
- [ ] Treasury is the intended cold/ops wallet: `0x056105E17F747d6006191bc401968a95D19e7F62`
- [ ] Owner is a hardware wallet or multisig before significant volume
- [ ] Contract paused-tested (`pause` / `unpause`)
- [ ] Test on Sepolia/Base Sepolia with test USDC before mainnet
- [ ] External audit before large TVL (best practice; no contract is “100%” without review)

### Built-in protections

| Risk | Mitigation |
|------|------------|
| Fake / scam tokens | Allowlist only |
| Price / plan / payer tampering | EIP-712 signed intent; **`payer` must == msg.sender** |
| Quote hijack / front-run with another's allowance | Signed `payer` binding (v2) |
| Fee-on-transfer / deflationary tokens | Balance delta must equal `amount` or revert |
| Cross-chain replay | EIP-712 domain binds `chainId` + verifyingContract |
| Double spend of same quote | `usedNonces[userId][nonce]` |
| Reentrancy | `ReentrancyGuard` + SafeERC20 |
| USDT non-standard ERC20 | SafeERC20 |
| Accidental ETH sends | `receive`/`fallback` revert |
| Owner key loss / hijack | `Ownable2Step` for ownership transfer |
| Runaway commission | Cap at 20% bps on-chain |
| Referrer = payer / this / treasury | On-chain reverts |
| Two-wallet self-referral | **Backend must not sign** fake attributions |

## Smoke test on Remix VM (optional)

1. Deploy a mock ERC20 (6 decimals), mint to a test account.
2. Deploy this contract with treasury = test account B, signer = account that will sign.
3. `setTokenAllowed(mock, true)`.
4. Off-chain: sign an intent; on-chain: `approve` + `paySubscription`.
5. Confirm balances and `PaymentReceived` event fields.
