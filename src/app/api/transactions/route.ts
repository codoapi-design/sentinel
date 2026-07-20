import { NextRequest, NextResponse } from 'next/server';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { CHAIN_IDS } from '@/lib/blockchain/types';

/**
 * GET /api/transactions
 * Fetch transactions for a wallet address using hybrid architecture
 *
 * Routing:
 *   Historical transactions → Etherscan V2 (primary)
 *   Fallback              → Covalent, then Alchemy
 *   Results cached in Supabase
 *
 * Query params:
 * - wallet: Wallet address (required)
 * - chainId: Chain ID (default: 1)
 * - page: Page number (default: 0)
 * - pageSize: Results per page (default: 25, max: 100)
 * - refresh: Force refresh from providers
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const chainId = parseInt(searchParams.get('chainId') || '1');
    const page = parseInt(searchParams.get('page') || '0');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '25'), 100);
    const refresh = searchParams.get('refresh') === 'true';

    if (!wallet) {
      return NextResponse.json(
        { error: 'wallet address is required' },
        { status: 400 },
      );
    }

    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    const providerManager = getProviderManager();

    // Invalidate cache if refresh requested
    if (refresh) {
      const { getBlockchainCache } = await import('@/lib/blockchain/cache');
      const cache = getBlockchainCache();
      await cache.invalidate(wallet, 'transactions');
    }

    const { transactions, providers } = await providerManager.fetchHistoricalTransactions(
      wallet,
      chainId,
      page,
      pageSize,
    );

    const chainNames = Object.fromEntries(
      Object.entries(CHAIN_IDS).map(([name, id]) => [id, name])
    );

    return NextResponse.json({
      success: true,
      data: transactions.map(tx => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.valueEth,
        valueUsd: tx.valueUsd ?? null,
        priceUsd: tx.priceUsd ?? null,
        gasFee: tx.gasFeeEth,
        timestamp: tx.timestamp,
        date: tx.date,
        type: tx.type,
        direction: tx.direction,
        status: tx.status,
        chain: tx.chain,
        chainId: tx.chainId,
        blockNumber: tx.blockNumber,
        protocol: tx.protocol,
        method: tx.methodName,
        tokenTransfers: tx.tokenTransfers.map(t => ({
          symbol: t.tokenSymbol,
          name: t.tokenName,
          amount: t.valueFormatted,
          from: t.from,
          to: t.to,
        })),
        provider: tx.provider,
      })),
      pagination: {
        page,
        pageSize,
        hasMore: transactions.length === pageSize,
      },
      meta: {
        chainId,
        chainName: chainNames[chainId] || 'unknown',
        providers,
        architecture: 'hybrid',
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching transactions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
