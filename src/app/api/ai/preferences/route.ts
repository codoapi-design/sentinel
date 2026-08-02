/**
 * GET /api/ai/preferences
 * PUT /api/ai/preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { listActivePreferences, upsertExplicitPreference } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

const putSchema = z.object({
  key: z.enum([
    'language',
    'fiat_currency',
    'analysis_depth',
    'default_wallet',
    'focus_areas',
    'response_style',
  ]),
  value: z.unknown(),
  source: z.enum(['explicit_user_setting', 'explicit_chat_confirmation']).optional(),
});

export async function GET() {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const rows = await listActivePreferences(auth.user.id);
  return NextResponse.json({
    success: true,
    data: rows.map(p => ({
      key: p.key,
      value: p.value,
      source: p.source,
      lastConfirmedAt: p.lastConfirmedAt,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.issues }, { status: 400 });
  }

  try {
    const row = await upsertExplicitPreference({
      userId: auth.user.id,
      key: parsed.data.key,
      value: parsed.data.value,
      source: parsed.data.source,
    });
    return NextResponse.json({
      success: true,
      data: { key: row.key, value: row.value, source: row.source },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid preference.' },
      { status: 400 },
    );
  }
}
