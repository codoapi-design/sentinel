/**
 * Shared auth helper for Package 3 memory HTTP routes.
 */

import { NextResponse } from 'next/server';

import { createCookieServerClient } from '@/lib/supabase/server';

export async function requireAiUser(): Promise<
  | { user: { id: string }; error?: undefined }
  | { user?: undefined; error: NextResponse }
> {
  const cookieClient = await createCookieServerClient();
  const {
    data: { user },
    error: authError,
  } = await cookieClient.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }
  return { user: { id: user.id } };
}
