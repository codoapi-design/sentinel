/**
 * Narrow wagmi connectors surface for Radareum.
 *
 * The upstream `@wagmi/connectors` barrel re-exports Tempo/Porto/Safe/MetaMask
 * connectors that pull optional peers (`accounts`, `porto`, …) and break
 * Next.js production builds. We only use injected / Coinbase / WalletConnect.
 */

export { injected, mock } from '@wagmi/core';

// Deep file imports (bypassing the package exports barrel).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved by bundler from node_modules file path
export { coinbaseWallet } from '../../../node_modules/@wagmi/connectors/dist/esm/coinbaseWallet.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved by bundler from node_modules file path
export { walletConnect } from '../../../node_modules/@wagmi/connectors/dist/esm/walletConnect.js';
