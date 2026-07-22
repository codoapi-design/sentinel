/**
 * Persist / read daily portfolio value snapshots.
 */

import { createServerClient } from '@/lib/supabase/server';

export async function upsertPortfolioSnapshot(input: {
  walletId: string;
  userId: string;
  totalValueUsd: number;
  tokenValueUsd: number;
  defiValueUsd: number;
  source?: string;
}): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('portfolio_snapshots').upsert(
      {
        wallet_id: input.walletId,
        user_id: input.userId,
        snapshot_date: snapshotDate,
        total_value_usd: Math.round(input.totalValueUsd * 100) / 100,
        token_value_usd: Math.round(input.tokenValueUsd * 100) / 100,
        defi_value_usd: Math.round(input.defiValueUsd * 100) / 100,
        source: input.source || 'sync',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet_id,snapshot_date' },
    );
    if (error) {
      // Table may not exist yet — soft-fail so sync never breaks
      console.warn('[PortfolioSnapshot] upsert failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[PortfolioSnapshot] upsert error:', err);
    return false;
  }
}

export async function listPortfolioSnapshots(
  walletId: string,
  fromDate?: string,
): Promise<Array<{ date: string; value: number }>> {
  try {
    const supabase = createServerClient();
    let q = supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value_usd')
      .eq('wallet_id', walletId)
      .order('snapshot_date', { ascending: true });
    if (fromDate) q = q.gte('snapshot_date', fromDate);
    const { data, error } = await q;
    if (error || !data) return [];
    return data.map(r => ({
      date: String(r.snapshot_date).slice(0, 10),
      value: Number(r.total_value_usd) || 0,
    }));
  } catch {
    return [];
  }
}
