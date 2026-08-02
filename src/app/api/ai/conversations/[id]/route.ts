/**
 * GET/PATCH/DELETE /api/ai/conversations/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { deleteConversationForUser, getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const row = await getMemoryStore().getConversation(id, auth.user.id);
  if (!row) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.issues }, { status: 400 });
  }

  const updated = await getMemoryStore().updateConversation(id, auth.user.id, {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const ok = await deleteConversationForUser(auth.user.id, id);
  if (!ok) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
