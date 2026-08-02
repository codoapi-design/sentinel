/**
 * POST /api/ai/history/delete
 * Body: { walletId?: string, all?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { deleteAllUserAiMemory, deleteWalletAiHistory } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

const schema = z
  .object({
    walletId: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine(v => v.all === true || Boolean(v.walletId), {
    message: 'Provide walletId or all=true.',
  });

export async function POST(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.all) {
    await deleteAllUserAiMemory(auth.user.id);
  } else if (parsed.data.walletId) {
    await deleteWalletAiHistory(auth.user.id, parsed.data.walletId);
  }

  return NextResponse.json({ success: true });
}
