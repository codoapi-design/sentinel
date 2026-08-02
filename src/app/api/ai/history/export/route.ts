/**
 * GET /api/ai/history/export?walletId=
 */

import { NextRequest, NextResponse } from 'next/server';

import { exportUserAiMemory } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  const walletId = new URL(request.url).searchParams.get('walletId') ?? undefined;
  const payload = await exportUserAiMemory(auth.user.id, walletId);
  return NextResponse.json({ success: true, data: payload });
}
