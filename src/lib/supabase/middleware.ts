/**
 * Supabase Middleware Client for Radareum
 * Creates a Supabase client that reads/writes cookies in middleware
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({
      request,
    });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Set cookies on the request so middleware can read them
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // Create a new response with the updated cookies
        supabaseResponse = NextResponse.next({
          request,
        });
        // Set cookies on the response so the browser stores them
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh the session - this is important for keeping the user authenticated
  await supabase.auth.getUser();

  return supabaseResponse;
}
