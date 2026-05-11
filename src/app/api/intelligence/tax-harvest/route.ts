import { NextRequest, NextResponse } from 'next/server';
import { TaxHarvestingEngine } from '@/lib/intelligence/tax-harvesting-engine';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ success: false, error: 'wallet query parameter is required' }, { status: 400 });
  }
  const engine = new TaxHarvestingEngine();
  const result = await engine.findHarvestOpportunities(wallet);
  return NextResponse.json({ success: true, data: result });
}
