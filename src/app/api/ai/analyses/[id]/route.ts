/**
 * GET /api/ai/analyses/[id]
 */

import { NextRequest, NextResponse } from 'next/server';

import { getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const row = await getMemoryStore().getAnalysis(id, auth.user.id);
  if (!row) return NextResponse.json({ error: 'Analysis not found.' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}
