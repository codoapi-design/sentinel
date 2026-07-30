/**
 * GET/POST /api/email/settings
 *
 * Persist email alert preferences (in-memory for development).
 */

import { NextRequest, NextResponse } from 'next/server';

import { createDefaultAlertPayloads } from '@/lib/plans/alerts';

type EmailSettingsData = {
  enabled: boolean;
  email: string;
  verified: boolean;
} & ReturnType<typeof createDefaultAlertPayloads>;

const settingsStore = new Map<string, EmailSettingsData>();

function defaultSettings(): EmailSettingsData {
  return {
    enabled: false,
    email: '',
    verified: false,
    ...createDefaultAlertPayloads(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';
    const settings = settingsStore.get(userId) ?? defaultSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API /email/settings GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, settings } = body;

    if (!userId || !settings) {
      return NextResponse.json({ error: 'userId and settings are required' }, { status: 400 });
    }

    settingsStore.set(userId, settings as EmailSettingsData);

    return NextResponse.json({
      success: true,
      message: 'Settings saved',
    });
  } catch (error) {
    console.error('[API /email/settings POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
