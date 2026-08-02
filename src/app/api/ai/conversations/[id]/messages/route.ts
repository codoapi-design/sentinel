/**
 * GET /api/ai/conversations/[id]/messages
 */

import { NextRequest, NextResponse } from 'next/server';

import { getMemoryStore } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;

  const conversation = await getMemoryStore().getConversation(id, auth.user.id);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const limit = Math.min(
    200,
    Math.max(1, Number(new URL(request.url).searchParams.get('limit') ?? '50') || 50),
  );
  const messages = await getMemoryStore().listMessages(id, auth.user.id, limit);
  return NextResponse.json({
    success: true,
    data: {
      conversationId: id,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        relatedAnalysisId: m.relatedAnalysisId ?? null,
      })),
    },
  });
}
