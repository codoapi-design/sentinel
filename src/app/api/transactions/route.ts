import { NextRequest, NextResponse } from 'next/server';
import { fetchAndClassifyTransactions, NETWORKS } from '@/lib/alchemy';

/**
 * GET /api/transactions
 * Fetch and classify transactions for a wallet address
 * 
 * Query params:
 * - wallet: Wallet address (required)
 * - network: Network key (default: 'ethereum')
 * - fromBlock: Starting block (default: '0x0')
 * - toBlock: Ending block (default: 'latest')
 * - maxCount: Max transactions per page (default: 50)
 * - pageKey: Pagination key from previous response
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const network = searchParams.get('network') || 'ethereum';
    const fromBlock = searchParams.get('fromBlock') || '0x0'; // Will be adjusted by service
    const toBlock = searchParams.get('toBlock') || 'latest';
    const maxCount = parseInt(searchParams.get('maxCount') || '25');
    const pageKey = searchParams.get('pageKey') || undefined;

    if (!wallet) {
      return NextResponse.json(
        { error: 'wallet address is required' },
        { status: 400 }
      );
    }

    // Validate network
    if (!NETWORKS[network]) {
      return NextResponse.json(
        { error: `Invalid network. Supported: ${Object.keys(NETWORKS).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    const result = await fetchAndClassifyTransactions({
      walletAddress: wallet,
      networkKey: network,
      fromBlock,
      toBlock,
      maxCount: Math.min(maxCount, 100), // Cap at 100
      pageKey,
    });

    return NextResponse.json({
      success: true,
      data: result.transactions,
      pagination: {
        pageKey: result.pageKey,
        totalFetched: result.totalFetched,
      },
      network: {
        key: result.networkKey,
        name: NETWORKS[result.networkKey].name,
        nameAr: NETWORKS[result.networkKey].nameAr,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching transactions:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
