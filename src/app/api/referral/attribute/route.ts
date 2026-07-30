import { NextRequest, NextResponse } from 'next/server';

import {
  attributeReferralSignup,
  hashSensitive,
  normalizeReferralCode,
} from '@/lib/referrals/core';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/referral/attribute
 * Bind the authenticated user to a referral code (from cookie / body).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = normalizeReferralCode(body.code || body.referralCode);
    if (!code) {
      return NextResponse.json({ error: 'Missing referral code' }, { status: 400 });
    }

    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '';
    const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : '';

    const admin = createServerClient();
    const result = await attributeReferralSignup({
      supabase: admin,
      referredUserId: user.id,
      referralCode: code,
      ipHash: hashSensitive(ip),
      fingerprintHash: hashSensitive(fingerprint),
    });

    return NextResponse.json({
      success: result.ok,
      reason: result.reason || null,
    });
  } catch (error) {
    console.error('[Referral Attribute]', error);
    return NextResponse.json({ error: 'Attribution failed' }, { status: 500 });
  }
}
