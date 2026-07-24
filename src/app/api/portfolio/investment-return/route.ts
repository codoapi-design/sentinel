/**
 * GET /api/portfolio/investment-return?walletId=
 *
 * Full investment-return detail: summary, per-asset breakdown, chart history.
 * Cookie auth. Soft-fails gracefully when schema is missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { computeInvestmentReturnDetail } from '@/lib/finance/investment-return';

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

    const detail = await computeInvestmentReturnDetail(wallet.id);

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('[InvestmentReturn API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
