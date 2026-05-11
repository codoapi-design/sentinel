/**
 * Supabase Server Client for Sentinel
 * Used in API routes with service role key for admin access
 * Falls back to anon key if service role key is not available
 * Lazy initialization to avoid build-time errors when env vars are missing
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export function createServerClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    // Return a dummy client that won't throw but will return error responses
    console.warn(
      'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
    return createClient<Database>(
      'https://placeholder.supabase.co',
      'placeholder-key',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
