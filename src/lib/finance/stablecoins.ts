/**
 * Stablecoin helpers — symbol alone is NEVER enough (scam clones reuse "USDC").
 * Only official contract addresses may be treated as $1 / trusted stables.
 */

export const STABLECOINS = new Set([
  'USDC',
  'USDT',
  'DAI',
  'BUSD',
  'USDD',
  'FRAX',
  'LUSD',
  'TUSD',
  'USDP',
  'GUSD',
  'USDBC', // Base bridged USDC (legacy)
]);

/** Official stablecoin contracts by chainId → symbol → address (lowercase). */
export const OFFICIAL_STABLECOIN_ADDRESSES: Record<number, Record<string, string>> = {
  1: {
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    FRAX: '0x853d955acef822db058eb8505911ed77f175b99e',
    LUSD: '0x5f98805a4e8be255a3308002ce8181f1b3f67a1c',
    TUSD: '0x0000000000085d4780b73119b644ae5ecd22b376',
  },
  8453: {
    USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    USDBC: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca',
    DAI: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
  },
  42161: {
    USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
  },
  10: {
    USDC: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    USDT: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
  },
  137: {
    USDC: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    DAI: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
  },
  56: {
    USDC: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    USDT: '0x55d398326f99059ff775485246999027b3197955',
    DAI: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
    BUSD: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
  },
  43114: {
    USDC: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a3e',
    USDT: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
    DAI: '0xd586e7f844cea2f87f50152665bcbc2c279d8d70',
  },
  59144: {
    USDC: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff',
    USDT: '0xa219439258ca9da29e9cc4ce5596924745e12b93',
  },
};

const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  bsc: 56,
  avalanche: 43114,
  linea: 59144,
};

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase().trim());
}

export function resolveStablecoinChainId(
  chainIdOrNetwork: number | string | null | undefined,
): number | null {
  if (typeof chainIdOrNetwork === 'number' && Number.isFinite(chainIdOrNetwork)) {
    return chainIdOrNetwork;
  }
  if (typeof chainIdOrNetwork === 'string') {
    const asNum = Number(chainIdOrNetwork);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    return NETWORK_TO_CHAIN_ID[chainIdOrNetwork.toLowerCase()] ?? null;
  }
  return null;
}

/**
 * True only when (chain, address) matches a known official stablecoin contract.
 * Scam clones that reuse the symbol "USDC" return false.
 */
export function isOfficialStablecoinAddress(
  chainIdOrNetwork: number | string | null | undefined,
  tokenAddress: string | null | undefined,
  symbol?: string | null,
): boolean {
  if (!tokenAddress) return false;
  const chainId = resolveStablecoinChainId(chainIdOrNetwork);
  if (chainId == null) return false;
  const bySymbol = OFFICIAL_STABLECOIN_ADDRESSES[chainId];
  if (!bySymbol) return false;

  const addr = tokenAddress.toLowerCase();
  if (symbol) {
    const official = bySymbol[symbol.toUpperCase().trim()];
    if (official) return official === addr;
  }
  return Object.values(bySymbol).some(a => a === addr);
}

/** $1 pricing is allowed only for official stablecoin contracts. */
export function shouldPriceAsOneUsd(
  chainIdOrNetwork: number | string | null | undefined,
  tokenAddress: string | null | undefined,
  symbol: string | null | undefined,
): boolean {
  if (!symbol || !isStablecoinSymbol(symbol)) return false;
  return isOfficialStablecoinAddress(chainIdOrNetwork, tokenAddress, symbol);
}
