import { NextRequest, NextResponse } from 'next/server';

import { enabled, evaluateTemporaryStyle } from '../_fixture';

export async function POST(request: NextRequest) {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message : '';
  return NextResponse.json({ success: true, data: evaluateTemporaryStyle(message) });
}
