import { NextRequest, NextResponse } from 'next/server';

import { ensureFreeTrialSubscription } from '@/lib/plans/ensure-free-trial';
import { createServerClient } from '@/lib/supabase/server';

const MAX_NAME = 80;

/**
 * POST /api/auth/register
 * Creates a confirmed user via service role, then the client signs in.
 * Also starts a 3-day Free Plan subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: 'Password must include uppercase, lowercase, and a number' },
        { status: 400 },
      );
    }
    if (!fullName || fullName.length > MAX_NAME) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    const admin = createServerClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        avatar_url: null,
      },
    });

    if (error) {
      const msg = error.message || 'Registration failed';
      if (/already|registered|exists/i.test(msg)) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      if (/rate limit/i.test(msg)) {
        return NextResponse.json(
          { error: 'Too many signup attempts. Please wait a minute and try again.' },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const user = data.user;
    if (!user) {
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const profilePayload = {
      user_id: user.id,
      email,
      full_name: fullName,
      avatar_url: null,
      plan: 'free',
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    const insert = await admin.from('user_profiles').insert(profilePayload as never);
    if (insert.error) {
      if (/null value in column ["']?id["']?/i.test(insert.error.message)) {
        await admin.from('user_profiles').insert({ ...profilePayload, id: user.id } as never);
      } else if (!/duplicate|unique/i.test(insert.error.message)) {
        console.warn('[API /auth/register] profile insert', insert.error.message);
      }
    }

    let trial = null;
    try {
      trial = await ensureFreeTrialSubscription(user.id, admin);
    } catch (err) {
      console.warn('[API /auth/register] free trial setup failed:', err);
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      email,
      freeTrial: trial,
    });
  } catch (error) {
    console.error('[API /auth/register]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
