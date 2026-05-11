import { NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      // Exchange the code for a session
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({
            auth_code: code,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          // Set auth cookie and redirect
          const res = NextResponse.redirect(`${origin}${next}`);
          // Set the session tokens as cookies
          if (data.access_token) {
            res.cookies.set('sb-access-token', data.access_token, {
              path: '/',
              maxAge: 60 * 60 * 24 * 7, // 7 days
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            });
          }
          if (data.refresh_token) {
            res.cookies.set('sb-refresh-token', data.refresh_token, {
              path: '/',
              maxAge: 60 * 60 * 24 * 30, // 30 days
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            });
          }
          return res;
        }
      } catch (error) {
        console.error('Error exchanging code for session:', error);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
