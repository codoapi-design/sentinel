/**
 * GET /api/portfolio
 *
 * Internal portfolio endpoint (cookie-based auth).
 * Returns real blockchain data for the active wallet.
 *
 * Query params:
 * - walletId: UUID of the wallet (optional, uses first wallet if not specified)
 * - refresh: Force refresh from providers (default: false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getBlockchainCache } from '@/lib/blockchain/cache';

export async function GET(request: NextRequest) {
  try {
    // ── Authenticate via cookie session ──
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');
    const forceRefresh = searchParams.get('refresh') === 'true';

    // ── Resolve wallet ──
    let wallet;
    if (walletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .eq('user_id', user.id)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
      }
      wallet = data;
    } else {
      // Use first wallet
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: 'No wallets found' }, { status: 404 });
      }
      wallet = data;
    }

    const address = wallet.address;

    // ── Try to get data from Supabase tables first (populated by sync) ──
    if (!forceRefresh) {
      // Check asset_positions
      const { data: tokenPositions } = await supabase
        .from('asset_positions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .gt('value_usd', 0)
        .order('value_usd', { ascending: false });

      // Check defi_positions
      const { data: defiPositions } = await supabase
        .from('defi_positions')
        .select('*')
        .eq('wallet_id', wallet.id);

      // If we have data from previous sync, use it
      if (tokenPositions && tokenPositions.length > 0) {
        const tokenValueUsd = tokenPositions.reduce((sum, t) => sum + (t.value_usd || 0), 0);
        const defiValueUsd = (defiPositions || []).reduce((sum, p) => sum + (p.net_value_usd || 0), 0);

        // Build chain breakdown
        const chainMap = new Map<string, { value: number; tokens: number; defi: number }>();
        for (const t of tokenPositions) {
          const existing = chainMap.get(t.chain) || { value: 0, tokens: 0, defi: 0 };
          existing.value += t.value_usd || 0;
          existing.tokens++;
          chainMap.set(t.chain, existing);
        }
        for (const p of defiPositions || []) {
          const existing = chainMap.get(p.chain) || { value: 0, tokens: 0, defi: 0 };
          existing.value += p.net_value_usd || 0;
          existing.defi++;
          chainMap.set(p.chain, existing);
        }

        // Calculate revenue/expense from transactions
        const { data: transactions } = await supabase
          .from('transactions')
          .select('type, value_eth, gas_fee_eth')
          .eq('wallet_id', wallet.id);

        let totalRevenue = 0;
        let totalExpenses = 0;
        let gasFees = 0;
        for (const tx of transactions || []) {
          if (tx.type === 'income') totalRevenue += tx.value_eth || 0;
          else if (tx.type === 'expense') totalExpenses += tx.value_eth || 0;
          gasFees += tx.gas_fee_eth || 0;
        }

        return NextResponse.json({
          success: true,
          source: 'cache',
          data: {
            walletId: wallet.id,
            address,
            totalValueUsd: tokenValueUsd + defiValueUsd,
            tokenValueUsd,
            defiValueUsd,
            tokens: tokenPositions.map(t => ({
              id: t.id,
              symbol: t.token_symbol,
              name: t.token_name,
              address: t.token_address,
              decimals: t.token_decimals,
              balance: Number(t.balance),
              priceUsd: t.price_usd,
              valueUsd: t.value_usd,
              change24h: t.change_24h,
              chain: t.chain,
              chainId: t.chain_id || 1,
              logoUrl: t.logo_url,
              isSpam: t.is_spam || false,
              isVerified: t.is_verified || false,
              provider: t.source || 'cache',
            })),
            defiPositions: (defiPositions || []).map(p => ({
              id: p.id,
              protocol: p.protocol_name,
              protocolId: p.protocol_id || '',
              chain: p.chain,
              type: p.position_type || 'unknown',
              netValueUsd: p.net_value_usd || 0,
              assetValueUsd: p.asset_value_usd || 0,
              debtValueUsd: p.debt_value_usd || 0,
              apy: p.apy,
              healthFactor: p.health_factor,
              logoUrl: p.protocol_logo,
              provider: p.source || 'cache',
            })),
            chainBreakdown: Array.from(chainMap.entries()).map(([chain, data]) => ({
              chain,
              valueUsd: data.value,
              tokenCount: data.tokens,
              defiPositionCount: data.defi,
            })),
            transactionSummary: {
              totalRevenue,
              totalExpenses,
              netFlow: totalRevenue - totalExpenses,
              gasFees,
              transactionCount: transactions?.length || 0,
            },
            lastSyncedAt: wallet.last_synced_at,
            isSyncing: wallet.is_syncing || false,
          },
        });
      }
    }

    // ── No cached data or force refresh: fetch from providers ──
    const cache = getBlockchainCache();
    if (forceRefresh) {
      await cache.invalidate(address, 'portfolio');
    }

    const providerManager = getProviderManager();
    const portfolio = await providerManager.getPortfolio(address);

    // Also fetch stored transactions for summary
    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, value_eth, gas_fee_eth')
      .eq('wallet_id', wallet.id);

    let totalRevenue = 0;
    let totalExpenses = 0;
    let gasFees = 0;
    for (const tx of transactions || []) {
      if (tx.type === 'income') totalRevenue += tx.value_eth || 0;
      else if (tx.type === 'expense') totalExpenses += tx.value_eth || 0;
      gasFees += tx.gas_fee_eth || 0;
    }

    return NextResponse.json({
      success: true,
      source: 'providers',
      data: {
        walletId: wallet.id,
        address,
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
          type: p.type,
          netValueUsd: p.netValueUsd,
          assetValueUsd: p.assetValueUsd,
          debtValueUsd: p.debtValueUsd,
          apy: p.apy,
          healthFactor: p.healthFactor,
          logoUrl: p.logoUrl,
          provider: p.provider,
        })),
        chainBreakdown: portfolio.chainBreakdown,
        transactionSummary: {
          totalRevenue,
          totalExpenses,
          netFlow: totalRevenue - totalExpenses,
          gasFees,
          transactionCount: transactions?.length || 0,
        },
        providers: portfolio.providers,
        lastSyncedAt: wallet.last_synced_at,
        isSyncing: wallet.is_syncing || false,
      },
    });
  } catch (error) {
    console.error('[Portfolio API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
