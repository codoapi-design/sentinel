import { NextRequest, NextResponse } from 'next/server';
import { ROIAnalyst } from '@/lib/intelligence/roi-analyst';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const analyst = new ROIAnalyst();
  const result = await analyst.analyzeWallet(wallet);
  return NextResponse.json({ success: true, data: result });
}
