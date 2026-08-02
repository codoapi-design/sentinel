import { NextRequest, NextResponse } from 'next/server';
import { chatTurn, enabled } from '../_fixture';
export async function POST(request: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  await chatTurn(typeof body.message === 'string' ? body.message : undefined);
  return NextResponse.json({ success: true });
}
