/**
 * GET /api/ai/insights/evolution?walletId=&lifecycleKey=
 * Deterministic multi-analysis evolution (requires ≥3 observations for trends).
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  attributeEvolution,
  computeIntelligenceEvolution,
  getMemoryStore,
} from '@/lib/ai/memory';
import type { EvolutionObservation } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const walletId = searchParams.get('walletId');
  const lifecycleKey = searchParams.get('lifecycleKey');
  if (!walletId) {
    return NextResponse.json({ error: 'walletId is required.' }, { status: 400 });
  }

  const store = getMemoryStore();
  const analyses = await store.listAnalyses(auth.user.id, walletId, 50);
  const chronological = [...analyses].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));

  const byKey = new Map<string, EvolutionObservation[]>();
  for (const analysis of chronological) {
    for (const snap of analysis.approvedInsights) {
      if (lifecycleKey && snap.lifecycleKey !== lifecycleKey) continue;
      const list = byKey.get(snap.lifecycleKey) ?? [];
      const value =
        typeof snap.observedValues.allocation_pct === 'number'
          ? snap.observedValues.allocation_pct
          : typeof snap.observedValues.value === 'number'
            ? snap.observedValues.value
            : null;
      list.push({
        analysisId: analysis.id,
        observedAt: analysis.createdAt,
        value,
        observedValues: snap.observedValues,
        direction: /fee|concentration|dependency|allocation/i.test(snap.findingType)
          ? 'lower_is_better'
          : 'higher_is_better',
      });
      byKey.set(snap.lifecycleKey, list);
    }
  }

  const evolutions = [...byKey.entries()].map(([key, observations]) => {
    const evolution = computeIntelligenceEvolution({ lifecycleKey: key, observations });
    const snapshots = chronological.flatMap(a =>
      a.approvedInsights.filter(s => s.lifecycleKey === key),
    );
    const attribution = attributeEvolution({ evolution, snapshots });
    return { ...evolution, ...attribution, observations };
  });

  return NextResponse.json({ success: true, data: evolutions });
}
