/**
 * GET /api/portfolio
 *
 * DB-first portfolio endpoint (cookie-based auth).
 *
 * Critical path: asset_positions + defi_positions only (instant Total Value / Assets).
 * Cash-flow summary comes from wallet_financial_summary when present; never scans
 * all transactions here. Investment return is loaded separately by the UI.
 *
 * Query params:
 * - walletId: UUID of the wallet (optional, uses first wallet if not specified)
 * - refresh: If true, runs an incremental sync then returns the fresh DB snapshot
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { getSyncEngine, releaseStaleSyncLock } from '@/lib/blockchain/sync-engine';
import { primaryDisplayAddress } from '@/lib/wallet/address-validation';
import {
  getWalletFinancialSummary,
  rebuildWalletReadModels,
} from '@/lib/finance/wallet-read-models';

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

    // ── Holdings first (critical path) + summary in parallel ──
    const [tokenResult, defiResult, storedSummary] = await Promise.all([
      supabase
        .from('asset_positions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .eq('is_verified', true)
        .eq('is_spam', false)
        .gt('value_usd', 0)
        .order('value_usd', { ascending: false }),
      supabase
        .from('defi_positions')
        .select('*')
        .eq('wallet_id', wallet.id),
      getWalletFinancialSummary(wallet.id),
    ]);

    const tokenPositions = tokenResult.data;
    const defiPositions = defiResult.data;

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

    let summary = {
      totalRevenue: 0,
      totalExpenses: 0,
      netFlow: 0,
      gasFees: 0,
      tradingVolume: 0,
      transactionCount: 0,
      pricedCashflowCount: 0,
      unpricedCount: 0,
      excludedActivityCount: 0,
      methodology: '',
    };
    let summarySource: 'read_model' | 'pending' = 'pending';

    if (storedSummary) {
      summary = {
        totalRevenue: Number(storedSummary.inflow_usd) || 0,
        totalExpenses: Number(storedSummary.outflow_usd) || 0,
        netFlow: Number(storedSummary.net_flow_usd) || 0,
        gasFees: Number(storedSummary.gas_fees_usd) || 0,
        tradingVolume: Number(storedSummary.trading_volume_usd) || 0,
        transactionCount: Number(storedSummary.tx_count) || 0,
        pricedCashflowCount: Number(storedSummary.priced_cashflow_count) || 0,
        unpricedCount: Number(storedSummary.unpriced_count) || 0,
        excludedActivityCount: Number(storedSummary.excluded_activity_count) || 0,
        methodology: storedSummary.methodology || '',
      };
      summarySource = 'read_model';
    } else {
      // Never scan full tx history on the holdings path — warm read models async.
      void rebuildWalletReadModels(wallet.id).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      source: summarySource === 'read_model' ? 'database+read_model' : 'database',
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
        // Loaded separately so Total Value / Assets are never blocked.
        investmentReturn: null,
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
