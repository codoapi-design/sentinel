/**
 * GET /api/cron/daily
 *
 * مهمة مجدولة: إرسال الملخص اليومي
 *
 * يتم استدعاؤها عبر Vercel Cron أو Supabase pg_cron كل يوم
 * في الوقت المحدد من قبل كل مستخدم (dailySummary.time)
 *
 * Vercel Cron config in next.config.js:
 *   crons: [{ path: '/api/cron/daily', schedule: '0 9 * * *' }]
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/services/ses';
import { renderReportEmail, type ReportEmailData } from '@/lib/email/templates';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In production:
    // 1. Query Supabase for users with dailySummary.enabled = true
    // 2. For each user, fetch their portfolio data
    // 3. Render and send the daily report

    /*
    const { data: users } = await supabase
      .from('email_settings')
      .select('user_id, email, daily_summary')
      .eq('enabled', true)
      .eq('verified', true)
      .eq('daily_summary->enabled', true);

    for (const user of users) {
      const portfolioData = await fetchUserPortfolio(user.user_id);
      const html = renderReportEmail({
        reportType: 'daily',
        periodLabel: new Date().toLocaleDateString('ar-SA'),
        ...portfolioData,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      });

      await sendEmail({
        to: user.email,
        subject: `الملخص اليومي - CryptoBooks`,
        html,
      });
    }
    */

    return NextResponse.json({
      success: true,
      message: 'Daily report cron executed',
      timestamp: new Date().toISOString(),
      note: 'Connect Supabase to enable actual email sending',
    });
  } catch (error) {
    console.error('[Cron /daily] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
