/**
 * Enforce per-wallet transaction caps for limited plans (Free / Starter).
 * Keeps the newest N rows by timestamp; Pro / Business are unlimited.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getTransactionLimit } from '@/lib/plans/limits';
import type { Database } from '@/lib/supabase/types';

export async function enforceWalletTransactionCap(
  supabase: SupabaseClient<Database>,
  walletId: string,
  planId: string | null | undefined,
): Promise<{ kept: number; deleted: number }> {
  const limit = getTransactionLimit(planId);
  if (!Number.isFinite(limit)) {
    return { kept: 0, deleted: 0 };
  }

  const { data: keepers } = await supabase
    .from('transactions')
    .select('id')
    .eq('wallet_id', walletId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  const keepIds = new Set((keepers || []).map(r => r.id));

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_id', walletId);

  const total = count ?? 0;
  if (total <= limit) {
    return { kept: total, deleted: 0 };
  }

  // Fetch ids beyond the keep window (oldest first) without loading everything at once.
  const { data: excess } = await supabase
    .from('transactions')
    .select('id')
    .eq('wallet_id', walletId)
    .order('timestamp', { ascending: true })
    .limit(Math.max(0, total - limit));

  const toDelete = (excess || []).filter(r => !keepIds.has(r.id)).map(r => r.id);
  let deleted = 0;
  const chunk = 200;
  for (let i = 0; i < toDelete.length; i += chunk) {
    const slice = toDelete.slice(i, i + chunk);
    const { error } = await supabase.from('transactions').delete().in('id', slice);
    if (!error) deleted += slice.length;
  }

  return { kept: keepIds.size, deleted };
}
