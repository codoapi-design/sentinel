/**
 * GET /api/ai/timeline?walletId=
 */

import { NextRequest, NextResponse } from 'next/server';

import { getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId');
  if (!walletId) {
    return NextResponse.json({ error: 'walletId is required.' }, { status: 400 });
  }
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? '50') || 50));
  const eventType = searchParams.get('eventType');
  let rows = await getMemoryStore().listTimeline(auth.user.id, walletId, limit);
  if (eventType) rows = rows.filter(row => row.eventType === eventType);
  return NextResponse.json({
    success: true,
    data: rows.map(t => ({
      id: t.id,
      eventType: t.eventType,
      title: t.title,
      summary: t.summary,
      lifecycleKey: t.lifecycleKey,
      analysisId: t.analysisId,
      occurredAt: t.occurredAt,
      priority: t.priority,
    })),
  });
}
