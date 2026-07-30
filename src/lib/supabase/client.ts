/**
 * Supabase Browser Client for Radareum
 * Uses @supabase/ssr default cookie handling (chunked, encoded).
 * Custom document.cookie handlers previously broke session persistence.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.',
    );
    return createBrowserClient<Database>(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYzNjEwMTMsImV4cCI6MTk2MTkzNzAxM30.placeholder',
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
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
