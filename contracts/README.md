# Radareum on-chain payments

Professional Solidity payment collector for Radareum subscriptions (USDC / USDT) with optional **10% referral** split.

## Quick links

- **Remix-ready contract:** [`remix/RadareumSubscriptionPayments.Remix.sol`](./remix/RadareumSubscriptionPayments.Remix.sol)
- **Deploy guide:** [`REMIX_DEPLOY.md`](./REMIX_DEPLOY.md)
- **DB activation notes:** [`BACKEND_INTEGRATION.md`](./BACKEND_INTEGRATION.md)
- **npm-style source:** [`RadareumSubscriptionPayments.sol`](./RadareumSubscriptionPayments.sol)

## Default treasury

`0x056105E17F747d6006191bc401968a95D19e7F62`

## Default commission

`1000` bps = **10%** to referrer, **90%** to treasury (or **100%** treasury if `referrer = address(0)`).
