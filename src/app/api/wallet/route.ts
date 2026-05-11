import { NextRequest, NextResponse } from 'next/server';
import { getNativeBalance, getWalletBalances, NETWORKS } from '@/lib/alchemy';

/**
 * GET /api/wallet
 * Get wallet balances (native + ERC-20 tokens)
 * 
 * Query params:
 * - address: Wallet address (required)
 * - network: Network key (default: 'ethereum')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const network = searchParams.get('network') || 'ethereum';

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      );
    }

    if (!NETWORKS[network]) {
      return NextResponse.json(
        { error: `Invalid network. Supported: ${Object.keys(NETWORKS).join(', ')}` },
        { status: 400 }
      );
    }

    if (!address.startsWith('0x') || address.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Fetch native balance and token balances in parallel
    const [nativeBalance, tokenBalances] = await Promise.all([
      getNativeBalance(address, network),
      getWalletBalances(address, network),
    ]);

    const networkConfig = NETWORKS[network];

    return NextResponse.json({
      success: true,
      data: {
        address,
        network: {
          key: network,
          name: networkConfig.name,
          nameAr: networkConfig.nameAr,
          nativeCurrency: networkConfig.nativeCurrency,
        },
        nativeBalance: {
          currency: networkConfig.nativeCurrency,
          amount: nativeBalance,
        },
        tokens: tokenBalances,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching wallet balances:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
