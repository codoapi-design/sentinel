/**
 * Solana balances + recent transactions via Alchemy JSON-RPC.
 */

import { alchemyHostRpc, isAlchemyKeyConfigured } from '@/lib/alchemy/rpc';
import type { TokenBalance, WalletTransaction } from '@/lib/blockchain/types';
import { getPricingService } from '@/lib/pricing/service';

const HOST = 'solana-mainnet.g.alchemy.com';
const CHAIN = 'solana';
const CHAIN_ID = 101;
const NATIVE = 'So11111111111111111111111111111111111111112';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export async function fetchSolanaBalances(address: string): Promise<TokenBalance[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];

  const pricing = getPricingService();
  const solPrice = await pricing.getCurrentNativePriceUsd(CHAIN_ID);
  const out: TokenBalance[] = [];

  try {
    // Solana getBalance returns { context, value } — not a bare lamports number.
    const balRes = await alchemyHostRpc<{ value?: number } | number>(HOST, 'getBalance', [
      address,
    ]);
    const lamports =
      typeof balRes === 'number' ? balRes : typeof balRes?.value === 'number' ? balRes.value : 0;
    const balance = lamports / 1e9;
    if (balance > 0) {
      out.push({
        symbol: 'SOL',
        name: 'Solana',
        address: NATIVE,
        decimals: 9,
        balance,
        rawBalance: String(lamports),
        priceUsd: solPrice,
        valueUsd: balance * solPrice,
        change24h: null,
        chain: CHAIN,
        chainId: CHAIN_ID,
        logoUrl: null,
        isSpam: false,
        isVerified: true,
        provider: 'alchemy',
      });
    }
  } catch (err) {
    console.warn('[Solana] getBalance failed:', err);
  }

  try {
    const result = await alchemyHostRpc<{
      value: Array<{
        pubkey: string;
        account: {
          data: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null };
              };
            };
          };
        };
      }>;
    }>(HOST, 'getTokenAccountsByOwner', [
      address,
      { programId: TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ]);

    for (const item of result?.value || []) {
      const info = item.account?.data?.parsed?.info;
      const mint = (info?.mint || '').toLowerCase();
      const amt = info?.tokenAmount;
      const balance = amt?.uiAmount ?? 0;
      if (!mint || !balance || balance <= 0) continue;
      out.push({
        symbol: mint.slice(0, 6).toUpperCase(),
        name: mint,
        address: mint,
        decimals: amt?.decimals ?? 9,
        balance,
        rawBalance: amt?.amount || '0',
        priceUsd: 0,
        valueUsd: 0,
        change24h: null,
        chain: CHAIN,
        chainId: CHAIN_ID,
        logoUrl: null,
        isSpam: false,
        isVerified: true,
        provider: 'alchemy',
      });
    }
  } catch (err) {
    console.warn('[Solana] getTokenAccountsByOwner failed:', err);
  }

  return out;
}

export async function fetchSolanaTransactions(
  address: string,
  limit = 40,
): Promise<WalletTransaction[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];

  try {
    const sigs = await alchemyHostRpc<
      Array<{ signature: string; slot: number; blockTime?: number | null; err: unknown }>
    >(HOST, 'getSignaturesForAddress', [address, { limit }]);

    return (sigs || []).map(s => {
      const ts = s.blockTime || Math.floor(Date.now() / 1000);
      return {
        hash: s.signature,
        from: address,
        to: address,
        value: '0',
        valueEth: 0,
        gasFee: '0',
        gasFeeEth: 0,
        timestamp: ts,
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        type: 'income' as WalletTransaction['type'],
        direction: 'self' as WalletTransaction['direction'],
        status: s.err ? ('failed' as const) : ('confirmed' as const),
        chain: CHAIN,
        chainId: CHAIN_ID,
        methodId: null,
        methodName: 'solana_transfer',
        protocol: null,
        tokenTransfers: [],
        valueUsd: null,
        priceUsd: null,
        blockNumber: s.slot || 0,
        provider: 'alchemy' as const,
      };
    });
  } catch (err) {
    console.warn('[Solana] getSignaturesForAddress failed:', err);
    return [];
  }
}
