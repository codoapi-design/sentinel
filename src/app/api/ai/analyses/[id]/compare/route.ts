/**
 * GET /api/ai/analyses/[id]/compare?previousId=
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  buildAnalysisComparison,
  buildHistoricalWhatMatters,
  explainConclusionChange,
  getMemoryStore,
} from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const store = getMemoryStore();
  const current = await store.getAnalysis(id, auth.user.id);
  if (!current) return NextResponse.json({ error: 'Analysis not found.' }, { status: 404 });

  const previousId = new URL(request.url).searchParams.get('previousId');
  let previous = previousId ? await store.getAnalysis(previousId, auth.user.id) : null;
  if (!previous) {
    const list = await store.listAnalyses(auth.user.id, current.walletId, 5);
    previous = list.find(a => a.id !== current.id) ?? null;
  }

  const lifecycles = await store.listLifecycles(auth.user.id, current.walletId);
  const comparison = buildAnalysisComparison({ current, previous, lifecycles });
  const historicalWhatMatters = buildHistoricalWhatMatters({
    current,
    comparison,
    lifecycles,
  });
  const conclusionChange = previous
    ? explainConclusionChange({ current, previous })
    : null;

  return NextResponse.json({
    success: true,
    data: {
      comparison,
      historicalWhatMatters,
      conclusionChange,
    },
  });
}
