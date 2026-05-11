import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data: walletData } = await supabase.from('wallets').select('id, user_id').ilike('address', wallet).single();
  if (!walletData) {
    return NextResponse.json({ success: true, data: [] });
  }
  const { data: alerts } = await supabase
    .from('alert_events')
    .select('*')
    .eq('user_id', walletData.user_id)
    .order('created_at', { ascending: false })
    .limit(50);
  return NextResponse.json({ success: true, data: alerts || [] });
}
