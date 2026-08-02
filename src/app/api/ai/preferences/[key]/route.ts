/**
 * DELETE /api/ai/preferences/[key]
 */

import { NextRequest, NextResponse } from 'next/server';

import { PREFERENCE_KEYS, resetPreference, type PreferenceKey } from '@/lib/ai/memory';
import { requireAiUser } from '@/lib/ai/memory/http-auth';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const auth = await requireAiUser();
  if (auth.error) return auth.error;
  const { key } = await context.params;
  if (!PREFERENCE_KEYS.includes(key as PreferenceKey)) {
    return NextResponse.json({ error: 'Unknown preference key.' }, { status: 400 });
  }
  const ok = await resetPreference(auth.user.id, key as PreferenceKey);
  if (!ok) return NextResponse.json({ error: 'Preference not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
