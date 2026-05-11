/**
 * POST /api/email/verify
 *
 * إرسال رمز التحقق أو التحقق من الرمز
 *
 * Body:
 *   action: 'send' | 'verify'
 *   email: string (required for 'send')
 *   code: string (required for 'verify')
 *   userId: string
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, generateVerificationCode } from '@/lib/email/services/ses';
import { renderVerificationEmail } from '@/lib/email/templates';

// In production, store in Supabase. For now, in-memory store.
// When Supabase is connected, replace this with DB operations.
const verificationStore = new Map<string, { code: string; expiresAt: number }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email, code, userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // ──────────────────────────────────────────
    // Action: Send verification code
    // ──────────────────────────────────────────
    if (action === 'send') {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'صيغة البريد الإلكتروني غير صحيحة' }, { status: 400 });
      }

      // Generate 6-digit code
      const verificationCode = generateVerificationCode();

      // Store code with 10-minute expiry
      // In production: INSERT INTO email_verification_codes
      verificationStore.set(userId, {
        code: verificationCode,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      // Render email template
      const html = renderVerificationEmail(verificationCode);

      // Send via SES
      const result = await sendEmail({
        to: email,
        subject: `رمز التحقق - CryptoBooks [${verificationCode}]`,
        html,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: 'فشل إرسال البريد الإلكتروني', details: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'تم إرسال رمز التحقق بنجاح',
      });
    }

    // ──────────────────────────────────────────
    // Action: Verify the code
    // ──────────────────────────────────────────
    if (action === 'verify') {
      if (!code) {
        return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
      }

      const stored = verificationStore.get(userId);

      if (!stored) {
        return NextResponse.json({ error: 'لم يتم إرسال رمز تحقق بعد' }, { status: 400 });
      }

      if (Date.now() > stored.expiresAt) {
        verificationStore.delete(userId);
        return NextResponse.json({ error: 'انتهت صلاحية رمز التحقق' }, { status: 400 });
      }

      if (stored.code !== code) {
        return NextResponse.json({ error: 'رمز التحقق غير صحيح' }, { status: 400 });
      }

      // Code verified - clean up
      verificationStore.delete(userId);

      // In production: UPDATE email_settings SET verified = true, email = $1 WHERE user_id = $2

      return NextResponse.json({
        success: true,
        message: 'تم التحقق من البريد الإلكتروني بنجاح',
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use "send" or "verify"' }, { status: 400 });
  } catch (error) {
    console.error('[API /email/verify] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
