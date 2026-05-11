import { NextRequest, NextResponse } from 'next/server';
import { DataIngestionService } from '@/lib/intelligence/data-ingestion';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { walletId } = body;
  if (!walletId) {
    return NextResponse.json({ success: false, error: 'walletId is required' }, { status: 400 });
  }
  const ingestion = new DataIngestionService();
  const result = await ingestion.syncWallet(walletId);
  return NextResponse.json({ success: result.success, data: result });
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const ingestion = new DataIngestionService();
  // For GET, we need to find the wallet ID first
  const { createServerClient } = await import('@/lib/supabase/server');
  const supabase = createServerClient();
  const { data: walletData } = await supabase.from('wallets').select('id').ilike('address', wallet).single();
  if (!walletData) {
    return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 });
  }
  const result = await ingestion.syncWallet(walletData.id);
  return NextResponse.json({ success: result.success, data: result });
}
