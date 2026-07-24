/**
 * GET /api/portfolio
 *
 * DB-first portfolio endpoint (cookie-based auth).
 *
 * Normal reads ALWAYS serve from Supabase tables populated by the sync engine.
 * External providers are never hit for display — only the sync endpoint talks
 * to Etherscan/CoinGecko and writes results into the DB.
 *
 * Query params:
 * - walletId: UUID of the wallet (optional, uses first wallet if not specified)
 * - refresh: If true, runs an incremental sync then returns the fresh DB snapshot
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { getSyncEngine, releaseStaleSyncLock } from '@/lib/blockchain/sync-engine';
import { primaryDisplayAddress } from '@/lib/wallet/address-validation';
import { computeFinancialSummary } from '@/lib/finance/summary';
import {
  computeInvestmentReturn,
  type InvestmentReturnResult,
} from '@/lib/finance/investment-return';
import { getPricingService } from '@/lib/pricing/service';

export async function GET(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const supabase = createServerClient();

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

    const address = primaryDisplayAddress(wallet);

    // Optional: refresh DB from providers via the sync engine, then read DB.
    // Never return live provider payloads directly to the UI.
    if (forceRefresh) {
      if (wallet.is_syncing) {
        await releaseStaleSyncLock(wallet);
        const { data: unlocked } = await supabase
          .from('wallets')
          .select('*')
          .eq('id', wallet.id)
          .single();
        if (unlocked) wallet = unlocked;
      }
      if (!wallet.is_syncing) {
        try {
          const syncEngine = getSyncEngine();
          const mode = wallet.last_synced_at ? 'incremental' : 'full';
          if (mode === 'full') {
            await syncEngine.fullSync(wallet.id);
          } else {
            await syncEngine.incrementalSync(wallet.id);
          }
          // Re-read wallet flags after sync
          const { data: refreshed } = await supabase
            .from('wallets')
            .select('*')
            .eq('id', wallet.id)
            .single();
          if (refreshed) wallet = refreshed;
        } catch (syncError) {
          console.warn('[Portfolio API] Refresh sync failed, serving DB snapshot:', syncError);
        }
      }
    }

    // ── Always serve from Supabase ──
    const { data: tokenPositions } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .gt('value_usd', 0)
      .order('value_usd', { ascending: false });

    const { data: defiPositions } = await supabase
      .from('defi_positions')
      .select('*')
      .eq('wallet_id', wallet.id);

    const tokenValueUsd = (tokenPositions || []).reduce((sum, t) => sum + (t.value_usd || 0), 0);
    const defiValueUsd = (defiPositions || []).reduce((sum, p) => sum + (p.net_value_usd || 0), 0);

    const chainMap = new Map<string, { value: number; tokens: number; defi: number }>();
    for (const t of tokenPositions || []) {
      const chainName = (t as { network?: string; chain?: string }).network || (t as { chain?: string }).chain || 'ethereum';
      const existing = chainMap.get(chainName) || { value: 0, tokens: 0, defi: 0 };
      existing.value += t.value_usd || 0;
      existing.tokens++;
      chainMap.set(chainName, existing);
    }
    for (const p of defiPositions || []) {
      const existing = chainMap.get(p.chain) || { value: 0, tokens: 0, defi: 0 };
      existing.value += p.net_value_usd || 0;
      existing.defi++;
      chainMap.set(p.chain, existing);
    }

    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, direction, value_usd, value_eth, gas_fee_eth, method_id, method_name, protocol, to_addr')
      .eq('wallet_id', wallet.id);

    let ethPriceUsd = 0;
    try {
      ethPriceUsd = await getPricingService().getCurrentNativePriceUsd(1);
    } catch {
      ethPriceUsd = 0;
    }

    const summary = computeFinancialSummary(transactions || [], { ethPriceUsd });

    let investmentReturn: InvestmentReturnResult | null = null;
    try {
      investmentReturn = await computeInvestmentReturn(wallet.id);
    } catch (err) {
      console.warn('[Portfolio API] investment return skipped:', err);
    }

    return NextResponse.json({
      success: true,
      source: 'database',
      data: {
        walletId: wallet.id,
        address,
        totalValueUsd: tokenValueUsd + defiValueUsd,
        tokenValueUsd,
        defiValueUsd,
        tokens: (tokenPositions || []).map(t => ({
          id: t.id,
          symbol: t.token_symbol,
          name: t.token_name,
          address: t.token_address,
          decimals: t.token_decimals,
          balance: Number(t.balance),
          priceUsd: t.price_usd,
          valueUsd: t.value_usd,
          change24h: t.change_24h,
          chain: (t as { network?: string; chain?: string }).network || (t as { chain?: string }).chain || 'ethereum',
          chainId: t.chain_id || 1,
          logoUrl: t.logo_url,
          isSpam: t.is_spam || false,
          isVerified: t.is_verified || false,
          provider: t.source || 'database',
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
          provider: p.source || 'database',
        })),
        chainBreakdown: Array.from(chainMap.entries()).map(([chain, data]) => ({
          chain,
          valueUsd: data.value,
          tokenCount: data.tokens,
          defiPositionCount: data.defi,
        })),
        transactionSummary: {
          totalRevenue: summary.totalRevenue,
          totalExpenses: summary.totalExpenses,
          netFlow: summary.netFlow,
          gasFees: summary.gasFees,
          tradingVolume: summary.tradingVolume,
          transactionCount: summary.transactionCount,
          pricedCashflowCount: summary.pricedCashflowCount,
          unpricedCount: summary.unpricedCount,
          excludedActivityCount: summary.excludedActivityCount,
          methodology: summary.methodology,
        },
        investmentReturn,
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
