/**
 * GET /api/cron/weekly
 *
 * مهمة مجدولة: إرسال التقرير الأسبوعي
 *
 * Schedule: كل يوم اثنين (أو حسب تفضيل المستخدم)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production: Same pattern as daily but fetches weekly data and
    // filters users by weeklyReport.enabled = true and matching day

    return NextResponse.json({
      success: true,
      message: 'Weekly report cron executed',
      timestamp: new Date().toISOString(),
      note: 'Connect Supabase to enable actual email sending',
    });
  } catch (error) {
    console.error('[Cron /weekly] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
