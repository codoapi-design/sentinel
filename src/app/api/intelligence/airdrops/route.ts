import { NextRequest, NextResponse } from 'next/server';
import { AirdropHunter } from '@/lib/intelligence/airdrop-hunter';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const hunter = new AirdropHunter();
  const airdrops = await hunter.findAirdrops(wallet);
  return NextResponse.json({ success: true, data: airdrops });
}
