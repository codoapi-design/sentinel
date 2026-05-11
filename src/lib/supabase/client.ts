/**
 * Supabase Browser Client for Sentinel
 * Uses @supabase/ssr to store sessions in cookies
 * This allows the middleware to read the session on the server side
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
    return createBrowserClient<Database>(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYzNjEwMTMsImV4cCI6MTk2MTkzNzAxM30.placeholder',
      {
        cookies: {
          getAll() { return []; },
          setAll() { /* noop */ },
        },
      }
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        if (typeof document === 'undefined') return [];
        const cookies = document.cookie.split('; ');
        return cookies
          .filter(c => c.startsWith('sb-'))
          .map(c => {
            const [name, ...rest] = c.split('=');
            return { name, value: rest.join('=') };
          });
      },
      setAll(cookiesToSet) {
        if (typeof document === 'undefined') return;
        cookiesToSet.forEach(({ name, value, options }) => {
          let cookieStr = `${name}=${value}`;
          if (options?.path) cookieStr += `; path=${options.path}`;
          if (options?.maxAge) cookieStr += `; max-age=${options.maxAge}`;
          if (options?.domain) cookieStr += `; domain=${options.domain}`;
          if (options?.sameSite) cookieStr += `; samesite=${options.sameSite}`;
          if (options?.secure) cookieStr += '; secure';
          document.cookie = cookieStr;
        });
      },
    },
  });
}

// Singleton instance for the browser client
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

// Default export for backward compatibility
export const supabase = getSupabaseBrowserClient();
