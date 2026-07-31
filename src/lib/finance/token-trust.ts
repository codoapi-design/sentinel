/**
 * Trusted-token gate for wallet intelligence.
 *
 * Only native coins and market-priced, non-spam ERC-20s count as "verified".
 * Stablecoin *symbols* alone are never enough — scam clones reuse "USDC".
 */

import {
  isOfficialStablecoinAddress,
  isStablecoinSymbol,
} from '@/lib/finance/stablecoins';

export const NATIVE_PLACEHOLDER = '0x0000000000000000000000000000000000000000';

export function isNativeTokenAddress(address: string | null | undefined): boolean {
  if (!address) return true;
  const a = address.toLowerCase();
  return a === NATIVE_PLACEHOLDER || a === '' || a === 'native';
}

/** Phishing / airdrop spam heuristics on symbol + name. */
export function isLikelySpamToken(symbol: string, name: string): boolean {
  const sym = (symbol || '').trim();
  const combined = `${sym} ${name || ''}`.toLowerCase();
  if (
    /https?:|www\.|\.com|\.io|\.xyz|\.org|\.net|\.app|\.vip|\.finance|claim|visit|reward|airdrop|voucher|bonus|t\.me|telegram|giveaway/.test(
      combined,
    )
  ) {
    return true;
  }
  if (/[^\x00-\x7F]/.test(sym)) return true;
  if (sym.length === 0 || sym.length > 20) return true;
  if (/^unknown$/i.test(sym)) return true;
  return false;
}

export type TokenTrustInput = {
  symbol?: string | null;
  name?: string | null;
  address?: string | null;
  chainId?: number | null;
  network?: string | null;
  isSpam?: boolean | null;
  isVerified?: boolean | null;
  priceUsd?: number | null;
  valueUsd?: number | null;
};

/**
 * True when this token may be stored and used in portfolio / cash-flow math.
 * - Native: always trusted
 * - Stablecoin symbols: ONLY official contract addresses
 * - Other ERC-20: need a real market price for that contract
 */
export function isTrustedToken(input: TokenTrustInput): boolean {
  if (input.isSpam === true) return false;
  if (isNativeTokenAddress(input.address)) return true;

  const symbol = (input.symbol || '').trim();
  const name = (input.name || '').trim();
  if (isLikelySpamToken(symbol, name)) return false;

  const chainRef = input.chainId ?? input.network ?? null;

  // Fake USDC/USDT/DAI clones must never pass on symbol alone.
  if (isStablecoinSymbol(symbol)) {
    return isOfficialStablecoinAddress(chainRef, input.address, symbol);
  }

  if (input.isVerified === false && !(typeof input.priceUsd === 'number' && input.priceUsd > 0)) {
    return false;
  }

  const price = typeof input.priceUsd === 'number' ? input.priceUsd : null;
  return price != null && price > 0;
}

export type TxTrustInput = {
  token_symbol?: string | null;
  token_name?: string | null;
  tokenSymbol?: string | null;
  tokenName?: string | null;
  token_address?: string | null;
  tokenAddress?: string | null;
  price_usd?: number | null;
  priceUsd?: number | null;
  value_usd?: number | null;
  valueUsd?: number | null;
  value_eth?: number | null;
  valueEth?: number | null;
  token?: string | null;
  price?: number | null;
  value?: number | null;
  chainId?: number | null;
  network?: string | null;
  chain?: string | null;
};

/**
 * Trusted on-chain transfer for history + Inflow/Outflow.
 * - Native transfer: trusted
 * - ERC-20: must pass isTrustedToken (official stable or priced contract)
 */
export function isTrustedTransaction(input: TxTrustInput): boolean {
  const address = input.token_address ?? input.tokenAddress ?? null;
  const symbol = input.token_symbol ?? input.tokenSymbol ?? input.token ?? null;
  const name = input.token_name ?? input.tokenName ?? null;
  const priceUsd = input.price_usd ?? input.priceUsd ?? input.price ?? null;
  const valueUsd = input.value_usd ?? input.valueUsd ?? input.value ?? null;
  const network = input.network ?? input.chain ?? null;

  if (isNativeTokenAddress(address)) {
    if (symbol && isStablecoinSymbol(symbol)) return false;
    if (symbol && !isNativeSymbol(symbol) && isLikelySpamToken(symbol, name || '')) {
      return false;
    }
    return true;
  }

  return isTrustedToken({
    symbol,
    name,
    address,
    chainId: input.chainId,
    network,
    priceUsd,
    valueUsd,
  });
}

function isNativeSymbol(symbol: string): boolean {
  return /^(ETH|BNB|MATIC|POL|AVAX|HYPE|MON|METIS|FTM|XDAI|CELO|S|SEI|BERA|RON|TRX|SOL|BTC|RBTC)$/i.test(
    symbol.trim(),
  );
}
