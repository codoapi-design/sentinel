/**
 * GET /api/ai/analyses?walletId=
 */

import { NextRequest, NextResponse } from 'next/server';

import { getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  const walletId = new URL(request.url).searchParams.get('walletId');
  if (!walletId) {
    return NextResponse.json({ error: 'walletId is required.' }, { status: 400 });
  }

  const limit = Math.min(
    100,
    Math.max(1, Number(new URL(request.url).searchParams.get('limit') ?? '20') || 20),
  );
  const rows = await getMemoryStore().listAnalyses(auth.user.id, walletId, limit);
  return NextResponse.json({
    success: true,
    data: rows.map(a => ({
      id: a.id,
      walletId: a.walletId,
      analysisType: a.analysisType,
      createdAt: a.createdAt,
      completionStatus: a.completionStatus,
      headline: a.whatMatters.headline,
      fingerprint: a.fingerprint,
    })),
  });
}
