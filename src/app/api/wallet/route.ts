import { NextRequest, NextResponse } from 'next/server';
import { getNativeBalance, getWalletBalances, NETWORKS } from '@/lib/alchemy';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/wallet
 *
 * Two modes based on query params:
 *
 * 1. Balances mode (legacy):
 *    - address: Wallet address (required)
 *    - network: Network key (default: 'ethereum')
 *    Returns native balance + ERC-20 token balances for a single network.
 *
 * 2. Portfolio mode (enhanced):
 *    - address: Wallet address (required)
 *    - mode: 'portfolio' (triggers full portfolio from providers + cache)
 *    Returns aggregated portfolio data: tokens, DeFi positions, chain breakdown.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const network = searchParams.get('network') || 'ethereum';
    const mode = searchParams.get('mode'); // 'portfolio' for full data

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      );
    }

    if (!address.startsWith('0x') || address.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // ── Portfolio mode: fetch from providers + cache ──
    if (mode === 'portfolio') {
      const supabase = createServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: 'Authentication required for portfolio data' },
          { status: 401 }
        );
      }

      // Verify the wallet belongs to the user
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, address, label')
        .ilike('address', address)
        .eq('user_id', user.id)
        .maybeSingle();

      try {
        const providerManager = getProviderManager();
        const portfolio = await providerManager.getPortfolio(address);

        return NextResponse.json({
          success: true,
          data: {
            address,
            walletId: wallet?.id || null,
            walletLabel: wallet?.label || null,
            totalValueUsd: portfolio.totalValueUsd,
            tokenValueUsd: portfolio.tokenValueUsd,
            defiValueUsd: portfolio.defiValueUsd,
            tokens: portfolio.tokens.map(t => ({
              symbol: t.symbol,
              name: t.name,
              address: t.address,
              decimals: t.decimals,
              balance: t.balance,
              priceUsd: t.priceUsd,
              valueUsd: t.valueUsd,
              change24h: t.change24h,
              chain: t.chain,
              chainId: t.chainId,
              logoUrl: t.logoUrl,
              isSpam: t.isSpam,
              isVerified: t.isVerified,
              provider: t.provider,
            })),
            defiPositions: portfolio.defiPositions.map(p => ({
              id: p.id,
              protocol: p.protocol,
              protocolId: p.protocolId,
              chain: p.chain,
              chainId: p.chainId,
              type: p.type,
              suppliedTokens: p.suppliedTokens.map(t => ({
                symbol: t.symbol,
                name: t.name,
                balance: t.balance,
                valueUsd: t.valueUsd,
              })),
              borrowedTokens: p.borrowedTokens.map(t => ({
                symbol: t.symbol,
                name: t.name,
                balance: t.balance,
                valueUsd: t.valueUsd,
              })),
              rewardTokens: p.rewardTokens.map(t => ({
                symbol: t.symbol,
                name: t.name,
                balance: t.balance,
                valueUsd: t.valueUsd,
              })),
              netValueUsd: p.netValueUsd,
              assetValueUsd: p.assetValueUsd,
              debtValueUsd: p.debtValueUsd,
              apy: p.apy,
              healthFactor: p.healthFactor,
              logoUrl: p.logoUrl,
              provider: p.provider,
            })),
            chainBreakdown: portfolio.chainBreakdown,
            providers: portfolio.providers,
            lastUpdated: portfolio.lastUpdated,
          },
        });
      } catch (portfolioError) {
        console.error('[Wallet] Portfolio fetch error:', portfolioError);
        return NextResponse.json(
          { error: portfolioError instanceof Error ? portfolioError.message : 'Failed to fetch portfolio' },
          { status: 500 }
        );
      }
    }

    // ── Legacy balances mode ──
    if (!NETWORKS[network]) {
      return NextResponse.json(
        { error: `Invalid network. Supported: ${Object.keys(NETWORKS).join(', ')}` },
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
