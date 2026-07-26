/** Known USD-pegged stablecoin symbols (priced ~$1). */
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
]);

export function isStablecoinSymbol(symbol: string): boolean {
  return STABLECOINS.has(symbol.toUpperCase());
}
