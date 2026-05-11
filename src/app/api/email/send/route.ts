/**
 * POST /api/email/send
 *
 * إرسال تنبيه فوري أو تقرير عبر البريد الإلكتروني
 *
 * Body:
 *   type: 'alert' | 'daily' | 'weekly' | 'monthly'
 *   userId: string
 *   data: AlertEmailData | ReportEmailData
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/services/ses';
import { renderAlertEmail, renderReportEmail, type AlertEmailData, type ReportEmailData } from '@/lib/email/templates';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, userId, email, data } = body;

    if (!type || !userId || !email) {
      return NextResponse.json(
        { error: 'type, userId, and email are required' },
        { status: 400 }
      );
    }

    let html: string;
    let subject: string;

    switch (type) {
      case 'alert': {
        const alertData = data as AlertEmailData;
        html = renderAlertEmail(alertData);
        subject = alertData.title;
        break;
      }
      case 'daily': {
        const reportData = data as ReportEmailData;
        html = renderReportEmail(reportData);
        subject = `الملخص اليومي - CryptoBooks - ${reportData.periodLabel}`;
        break;
      }
      case 'weekly': {
        const reportData = data as ReportEmailData;
        html = renderReportEmail(reportData);
        subject = `التقرير الأسبوعي - CryptoBooks - ${reportData.periodLabel}`;
        break;
      }
      case 'monthly': {
        const reportData = data as ReportEmailData;
        html = renderReportEmail(reportData);
        subject = `التقرير الشهري - CryptoBooks - ${reportData.periodLabel}`;
        break;
      }
      default:
        return NextResponse.json(
          { error: 'Invalid type. Use: alert, daily, weekly, monthly' },
          { status: 400 }
        );
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'فشل إرسال البريد الإلكتروني', details: result.error },
        { status: 500 }
      );
    }

    // In production: INSERT INTO email_log (user_id, email, type, subject, status, ses_message_id)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('[API /email/send] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
