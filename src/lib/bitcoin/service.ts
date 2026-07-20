/**
 * Bitcoin balance via Alchemy (scantxoutset) + best-effort recent activity.
 */

import { alchemyHostRpc, isAlchemyKeyConfigured } from '@/lib/alchemy/rpc';
import type { TokenBalance, WalletTransaction } from '@/lib/blockchain/types';
import { getPricingService } from '@/lib/pricing/service';

const HOST = 'bitcoin-mainnet.g.alchemy.com';
const CHAIN = 'bitcoin';
const CHAIN_ID = 0;
const NATIVE = 'btc';

export async function fetchBitcoinBalances(address: string): Promise<TokenBalance[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];

  const pricing = getPricingService();
  const btcPrice = await pricing.getCurrentNativePriceUsd(CHAIN_ID);

  try {
    // Bitcoin Core: scan UTXO set for address descriptor
    const result = await alchemyHostRpc<{
      total_amount?: number;
      unspents?: Array<{ amount?: number; txid?: string; height?: number }>;
    }>(HOST, 'scantxoutset', ['start', [`addr(${address})`]]);

    const amount = result?.total_amount ?? 0;
    if (amount <= 0) return [];

    const sats = Math.round(amount * 1e8);
    return [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        address: NATIVE,
        decimals: 8,
        balance: amount,
        rawBalance: String(sats),
        priceUsd: btcPrice,
        valueUsd: amount * btcPrice,
        change24h: null,
        chain: CHAIN,
        chainId: CHAIN_ID,
        logoUrl: null,
        isSpam: false,
        isVerified: true,
        provider: 'alchemy',
      },
    ];
  } catch (err) {
    console.warn('[Bitcoin] scantxoutset failed:', err);
    return [];
  }
}

export async function fetchBitcoinTransactions(
  address: string,
  limit = 20,
): Promise<WalletTransaction[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];

  try {
    const result = await alchemyHostRpc<{
      unspents?: Array<{ txid?: string; height?: number; amount?: number }>;
      total_amount?: number;
    }>(HOST, 'scantxoutset', ['start', [`addr(${address})`]]);

    const utxos = (result?.unspents || []).slice(0, limit);
    const now = Math.floor(Date.now() / 1000);

    return utxos
      .filter(u => u.txid)
      .map(u => ({
        hash: u.txid!,
        from: '',
        to: address,
        value: String(Math.round((u.amount || 0) * 1e8)),
        valueEth: u.amount || 0,
        gasFee: '0',
        gasFeeEth: 0,
        timestamp: now,
        date: new Date(now * 1000).toISOString().slice(0, 10),
        type: 'income' as WalletTransaction['type'],
        direction: 'in' as WalletTransaction['direction'],
        status: 'confirmed' as const,
        chain: CHAIN,
        chainId: CHAIN_ID,
        methodId: null,
        methodName: 'utxo',
        protocol: null,
        tokenTransfers: [],
        valueUsd: null,
        priceUsd: null,
        blockNumber: u.height || 0,
        provider: 'alchemy' as const,
      }));
  } catch (err) {
    console.warn('[Bitcoin] utxo listing failed:', err);
    return [];
  }
}
