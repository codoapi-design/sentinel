/**
 * GET /api/ai/insights/lifecycle?walletId=
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

  const activeOnly = searchParams.get('activeOnly') !== 'false';
  let rows = await getMemoryStore().listLifecycles(auth.user.id, walletId);
  if (activeOnly) {
    rows = rows.filter(l => !['resolved', 'superseded'].includes(l.state));
  }

  return NextResponse.json({
    success: true,
    data: rows.map(l => ({
      lifecycleKey: l.lifecycleKey,
      findingType: l.findingType,
      state: l.state,
      occurrenceCount: l.occurrenceCount,
      consecutiveOccurrenceCount: l.consecutiveOccurrenceCount,
      firstDetectedAt: l.firstDetectedAt,
      lastDetectedAt: l.lastDetectedAt,
      currentSnapshotId: l.currentSnapshotId ?? null,
    })),
  });
}
