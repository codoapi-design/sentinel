/**
 * GET  /api/ai/conversations — list
 * POST /api/ai/conversations — create
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createConversation, getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

const createSchema = z.object({
  walletId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(200).optional(),
});

export async function GET() {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  const rows = await getMemoryStore().listConversations(auth.user.id);
  return NextResponse.json({
    success: true,
    data: rows.map(c => ({
      id: c.id,
      walletId: c.walletId,
      title: c.title,
      channel: c.channel,
      status: c.status,
      updatedAt: c.updatedAt,
      lastMessageAt: c.lastMessageAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.issues }, { status: 400 });
  }

  const conversation = await createConversation({
    userId: auth.user.id,
    walletId: parsed.data.walletId,
    title: parsed.data.title,
  });

  return NextResponse.json({ success: true, data: conversation }, { status: 201 });
}
