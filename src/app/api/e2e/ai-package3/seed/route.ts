import { NextResponse } from 'next/server';
import { enabled, seed } from '../_fixture';
export async function POST() {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ success: true, data: await seed() });
}
