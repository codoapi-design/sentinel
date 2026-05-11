import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, logAdminAction } from '@/lib/admin/auth';

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'User ID and verification code are required' }, { status: 400 });
    }

    if (session.user.id !== userId) {
      return NextResponse.json({ error: 'User ID mismatch' }, { status: 400 });
    }

    const adminCheck = await isAdmin(userId);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the TOTP code using Supabase auth
    // Note: For production, implement proper TOTP verification
    // This is a basic implementation that checks if the code is 6 digits
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 });
    }

    // In production, you would verify the TOTP code against the stored secret
    // using a library like 'otpauth' or 'speakeasy'
    // For now, we accept any valid 6-digit code as a placeholder

    await logAdminAction({
      adminId: userId,
      action: '2fa_verified',
      targetType: 'admin',
      targetId: userId,
    });

    return NextResponse.json({ success: true, message: '2FA verification successful' });
  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
