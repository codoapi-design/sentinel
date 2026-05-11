import { NextRequest, NextResponse } from 'next/server';
import { SecurityRadar } from '@/lib/intelligence/security-radar';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const radar = new SecurityRadar();
  const result = await radar.scanWallet(wallet);
  return NextResponse.json({ success: true, data: result });
}
