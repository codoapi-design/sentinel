import { getAddress, type Address } from 'viem';

/** Deployed RadareumSubscriptionPayments on Ethereum mainnet. */
export const PAYMENT_CONTRACT_MAINNET =
  '0x391b88351974592A8f5e1cc1B87e7D6B2EAeEA6c' as const satisfies Address;

export const PAYMENT_TREASURY_DEFAULT =
  '0x056105E17F747d6006191bc401968a95D19e7F62' as const satisfies Address;

export const EIP712_DOMAIN_NAME = 'RadareumSubscriptionPayments';
export const EIP712_DOMAIN_VERSION = '2';

export const INTENT_DEADLINE_SECONDS = 15 * 60;

/** Chains with a live payment contract (extend when you deploy elsewhere). */
export const PAYMENT_DEPLOYED_CHAIN_IDS = [1] as const;

export type PaymentTokenSymbol = 'USDC' | 'USDT';

function readContractEnv(chainId: number): string | undefined {
  const key = `PAYMENT_CONTRACT_${chainId}`;
  const publicKey = `NEXT_PUBLIC_PAYMENT_CONTRACT_${chainId}`;
  return process.env[publicKey] || process.env[key] || undefined;
}

/** Resolves the payment contract for a chain. Mainnet is wired by default. */
export function getPaymentContractAddress(chainId: number): Address | null {
  const fromEnv = readContractEnv(chainId);
  if (fromEnv) {
    try {
      return getAddress(fromEnv);
    } catch {
      return null;
    }
  }
  if (chainId === 1) return PAYMENT_CONTRACT_MAINNET;
  return null;
}

export function getPaymentTreasury(): Address {
  const raw = process.env.PAYMENT_TREASURY || PAYMENT_TREASURY_DEFAULT;
  return getAddress(raw);
}

export function isPaymentChainSupported(chainId: number): boolean {
  return getPaymentContractAddress(chainId) != null;
}
