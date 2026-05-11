/**
 * GET /api/cron/monthly
 *
 * مهمة مجدولة: إرسال التقرير الشهري
 *
 * Schedule: يوم 1 من كل شهر (أو حسب تفضيل المستخدم)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production: Same pattern but fetches monthly data including
    // tax analysis and recommendations (unique to monthly report)

    return NextResponse.json({
      success: true,
      message: 'Monthly report cron executed',
      timestamp: new Date().toISOString(),
      note: 'Connect Supabase to enable actual email sending',
    });
  } catch (error) {
    console.error('[Cron /monthly] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
