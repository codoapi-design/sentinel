/**
 * Tron balances + recent activity via Alchemy.
 * Uses eth-compatible JSON-RPC where available; falls back gracefully.
 */

import { alchemyHostRpc, isAlchemyKeyConfigured } from '@/lib/alchemy/rpc';
import type { TokenBalance, WalletTransaction } from '@/lib/blockchain/types';
import { getPricingService } from '@/lib/pricing/service';

const HOST = 'tron-mainnet.g.alchemy.com';
const CHAIN = 'tron';
const CHAIN_ID = 728126428;
const NATIVE = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'; // TRX placeholder native id

/** Minimal Base58Check → hex for Tron addresses (no checksum verify). */
function tronBase58ToHex(address: string): string | null {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const c of address) {
    const idx = ALPHABET.indexOf(c);
    if (idx < 0) return null;
    num = num * BigInt(58) + BigInt(idx);
  }
  let hex = num.toString(16);
  // Tron addresses decode to 25 bytes (1 version + 20 address + 4 checksum)
  while (hex.length < 50) hex = `0${hex}`;
  if (hex.length > 50) hex = hex.slice(-50);
  // Drop version (2 hex) + checksum (8 hex) → 40 hex body
  const body = hex.slice(2, 42);
  return body.length === 40 ? `0x${body}` : null;
}

export async function fetchTronBalances(address: string): Promise<TokenBalance[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];

  const pricing = getPricingService();
  const trxPrice = await pricing.getCurrentNativePriceUsd(CHAIN_ID);
  const out: TokenBalance[] = [];
  const hex = tronBase58ToHex(address);

  try {
    let sun = BigInt(0);
    if (hex) {
      const balHex = await alchemyHostRpc<string>(HOST, 'eth_getBalance', [hex, 'latest']);
      sun = BigInt(balHex || '0x0');
    }
    // Also try account resource style if eth path returns 0
    if (sun === BigInt(0)) {
      try {
        const acct = await alchemyHostRpc<{ balance?: number }>(HOST, 'eth_call', [
          { to: hex || address, data: '0x' },
          'latest',
        ]).catch(() => null);
        void acct;
      } catch {
        // ignore
      }
    }

    const balance = Number(sun) / 1e6; // TRX has 6 decimals in sun
    if (balance > 0) {
      out.push({
        symbol: 'TRX',
        name: 'TRON',
        address: NATIVE,
        decimals: 6,
        balance,
        rawBalance: sun.toString(),
        priceUsd: trxPrice,
        valueUsd: balance * trxPrice,
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
    console.warn('[Tron] balance fetch failed:', err);
  }

  // ERC-20-like TRC-20 via alchemy_getTokenBalances when hex available
  if (hex) {
    try {
      const tokenBal = await alchemyHostRpc<{
        tokenBalances: Array<{ contractAddress: string; tokenBalance: string | null }>;
      }>(HOST, 'alchemy_getTokenBalances', [hex, 'erc20']);

      for (const b of (tokenBal?.tokenBalances || []).slice(0, 30)) {
        if (!b.tokenBalance || b.tokenBalance === '0x0') continue;
        let raw = BigInt(0);
        try {
          raw = BigInt(b.tokenBalance);
        } catch {
          continue;
        }
        if (raw <= BigInt(0)) continue;
        const balance = Number(raw) / 1e6;
        out.push({
          symbol: 'TRC20',
          name: b.contractAddress,
          address: (b.contractAddress || '').toLowerCase(),
          decimals: 6,
          balance,
          rawBalance: raw.toString(),
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
      console.warn('[Tron] token balances failed:', err);
    }
  }

  return out;
}

export async function fetchTronTransactions(
  address: string,
  limit = 40,
): Promise<WalletTransaction[]> {
  if (!isAlchemyKeyConfigured() || !address) return [];
  const hex = tronBase58ToHex(address);
  if (!hex) return [];

  try {
    const result = await alchemyHostRpc<{
      transfers?: Array<{
        hash?: string;
        from?: string;
        to?: string;
        value?: number | string;
        blockNum?: number;
        metadata?: { blockTimestamp?: number };
        category?: string;
      }>;
    }>(HOST, 'alchemy_getAssetTransfers', [
      {
        fromAddress: hex,
        category: ['external', 'erc20'],
        maxCount: `0x${limit.toString(16)}`,
        order: 'desc',
        withMetadata: true,
      },
    ]);

    const transfers = result?.transfers || [];
    // Also pull inbound
    let inbound: typeof transfers = [];
    try {
      const inRes = await alchemyHostRpc<{ transfers?: typeof transfers }>(HOST, 'alchemy_getAssetTransfers', [
        {
          toAddress: hex,
          category: ['external', 'erc20'],
          maxCount: `0x${limit.toString(16)}`,
          order: 'desc',
          withMetadata: true,
        },
      ]);
      inbound = inRes?.transfers || [];
    } catch {
      inbound = [];
    }

    const seen = new Set<string>();
    const combined = [...transfers, ...inbound].filter(t => {
      const h = t.hash || '';
      if (!h || seen.has(h)) return false;
      seen.add(h);
      return true;
    });

    return combined.slice(0, limit).map(t => {
      const ts = Math.floor((t.metadata?.blockTimestamp || Date.now()) / 1000);
      const from = (t.from || '').toLowerCase();
      const direction =
        from === hex.toLowerCase() ? ('out' as const) : ('in' as const);
      return {
        hash: t.hash || `${t.blockNum}-${from}`,
        from: t.from || '',
        to: t.to || '',
        value: String(t.value ?? 0),
        valueEth: Number(t.value ?? 0),
        gasFee: '0',
        gasFeeEth: 0,
        timestamp: ts,
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        type: (direction === 'in' ? 'income' : 'expense') as WalletTransaction['type'],
        direction,
        status: 'confirmed' as const,
        chain: CHAIN,
        chainId: CHAIN_ID,
        methodId: null,
        methodName: t.category || 'tron_transfer',
        protocol: null,
        tokenTransfers: [],
        valueUsd: null,
        priceUsd: null,
        blockNumber: t.blockNum || 0,
        provider: 'alchemy' as const,
      };
    });
  } catch (err) {
    console.warn('[Tron] transfers failed:', err);
    return [];
  }
}
