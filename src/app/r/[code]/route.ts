import { NextRequest, NextResponse } from 'next/server';

import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_DAYS,
  normalizeReferralCode,
} from '@/lib/referrals/core';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /r/[code] — capture referral, set cookie, redirect to signup.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = normalizeReferralCode(raw);
  const origin = request.nextUrl.origin;
  const signup = new URL('/signup', origin);

  if (!code) {
    return NextResponse.redirect(signup);
  }

  // Soft-validate code exists (don't leak — always redirect)
  try {
    const admin = createServerClient();
    const { data } = await admin
      .from('referral_profiles')
      .select('referral_code')
      .eq('referral_code', code)
      .eq('status', 'active')
      .maybeSingle();

    if (data?.referral_code) {
      signup.searchParams.set('ref', data.referral_code);
    } else {
      signup.searchParams.set('ref', code);
    }
  } catch {
    signup.searchParams.set('ref', code);
  }

  const res = NextResponse.redirect(signup);
  res.cookies.set(REFERRAL_COOKIE, code, {
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
    sameSite: 'lax',
    httpOnly: false,
  });
  return res;
}
