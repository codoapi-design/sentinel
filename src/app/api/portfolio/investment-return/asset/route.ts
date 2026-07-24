/**
 * GET /api/portfolio/investment-return/asset?walletId=&symbol=&address=&chainId=&network=
 *
 * Per-asset investment-return detail: summary, lot-lifecycle chart, story timeline.
 * Cookie auth. Soft-fails gracefully when schema / asset is missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { computeInvestmentReturnAssetDetail } from '@/lib/finance/investment-return';

export async function GET(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('walletId');
    const symbol = (searchParams.get('symbol') || '').trim();
    const address = (searchParams.get('address') || '').trim() || null;
    const network = (searchParams.get('network') || '').trim() || null;
    const chainIdRaw = searchParams.get('chainId');
    const chainId =
      chainIdRaw != null && chainIdRaw !== '' && Number.isFinite(Number(chainIdRaw))
        ? Number(chainIdRaw)
        : null;

    if (!symbol && !address) {
      return NextResponse.json(
        { error: 'symbol or address is required' },
        { status: 400 },
      );
    }

    let wallet;
    if (walletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('id')
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
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: 'No wallets found' }, { status: 404 });
      }
      wallet = data;
    }

    const detail = await computeInvestmentReturnAssetDetail(wallet.id, {
      symbol: symbol || 'UNKNOWN',
      address,
      chainId,
      network,
    });

    if (!detail) {
      return NextResponse.json({ error: 'Asset not found in investment lots' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('[InvestmentReturnAsset API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
