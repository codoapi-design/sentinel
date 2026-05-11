import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getBlockchainService } from '@/lib/blockchain-unified';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: walletData } = await supabase.from('wallets').select('*').ilike('address', wallet).single();

  let portfolioSummary = null;
  try {
    const blockchain = getBlockchainService();
    portfolioSummary = await blockchain.getPortfolio(wallet);
  } catch (e) {
    console.error('Portfolio fetch error:', e);
  }

  return NextResponse.json({
    success: true,
    data: {
      wallet: walletData || null,
      portfolio: portfolioSummary || { totalValueUsd: 0, tokenValueUsd: 0, defiValueUsd: 0, tokens: [], defiPositions: [], provider: 'none' },
    },
  });
}
