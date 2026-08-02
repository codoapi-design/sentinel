import { NextRequest, NextResponse } from 'next/server';
import { enabled, persist } from '../_fixture';
export async function POST(request: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const label = body.label === 'A' || body.label === 'B' || body.label === 'C' ? body.label : 'C';
  return NextResponse.json({ success: true, data: await persist(label) });
}
