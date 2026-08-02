import { NextResponse } from 'next/server';
import { enabled, state } from '../_fixture';
export async function GET() {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ success: true, data: await state() });
}
