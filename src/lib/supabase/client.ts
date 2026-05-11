/**
 * Supabase Client for CryptoBooks
 * Browser-side client with anon key
 * Lazy initialization to avoid build-time errors when env vars are missing
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

let _supabase: SupabaseClient<Database> | null = null;

function getSupabase(): SupabaseClient<Database> {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a dummy client that won't throw but will return error responses
    // This allows the build to succeed even without Supabase credentials
    console.warn(
      'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
    _supabase = createClient<Database>(
      'https://placeholder.supabase.co',
      'placeholder-key',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    return _supabase;
  }

  _supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return _supabase;
}

// Export a Proxy that lazily initializes the client on first property access
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
