import { NextResponse } from 'next/server';
import { deleteConversation, enabled } from '../_fixture';
export async function DELETE() {
  if (!enabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ success: await deleteConversation() });
}
