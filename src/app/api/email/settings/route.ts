/**
 * GET/POST /api/email/settings
 *
 * حفظ واسترجاع إعدادات البريد الإلكتروني
 *
 * In production, this reads/writes from Supabase email_settings table.
 * Currently uses in-memory store for development.
 */

import { NextRequest, NextResponse } from 'next/server';

interface EmailSettingsData {
  enabled: boolean;
  email: string;
  verified: boolean;
  inboundAbove: { enabled: boolean; amount: number };
  outboundAbove: { enabled: boolean; amount: number };
  portfolioReaches: { enabled: boolean; amount: number };
  assetRises: { enabled: boolean; percentage: number; asset: string };
  assetDrops: { enabled: boolean; percentage: number; asset: string };
  dailySummary: { enabled: boolean; time: string };
  weeklyReport: { enabled: boolean; day: string };
  gasExceeds: { enabled: boolean; amount: number };
  monthlyReport: { enabled: boolean; day: number };
  largeTransaction: { enabled: boolean; amount: number };
}

// In-memory store for development
const settingsStore = new Map<string, EmailSettingsData>();

// GET - Retrieve settings
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';

    // In production: SELECT * FROM email_settings WHERE user_id = $1
    const settings = settingsStore.get(userId);

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        email: '',
        verified: false,
        inboundAbove: { enabled: false, amount: 1000 },
        outboundAbove: { enabled: false, amount: 500 },
        portfolioReaches: { enabled: false, amount: 80000 },
        assetRises: { enabled: false, percentage: 5, asset: 'ETH' },
        assetDrops: { enabled: false, percentage: 5, asset: 'ETH' },
        dailySummary: { enabled: false, time: '09:00' },
        weeklyReport: { enabled: false, day: 'الاثنين' },
        gasExceeds: { enabled: false, amount: 50 },
        monthlyReport: { enabled: false, day: 1 },
        largeTransaction: { enabled: false, amount: 5000 },
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[API /email/settings GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, settings } = body;

    if (!userId || !settings) {
      return NextResponse.json({ error: 'userId and settings are required' }, { status: 400 });
    }

    // In production: UPSERT INTO email_settings
    settingsStore.set(userId, settings);

    return NextResponse.json({
      success: true,
      message: 'تم حفظ الإعدادات بنجاح',
    });
  } catch (error) {
    console.error('[API /email/settings POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
