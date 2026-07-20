/**
 * One-shot: full-sync every wallet in Supabase (Etherscan + Alchemy + CoinGecko → DB).
 * Usage: npx tsx --env-file=.env.local scripts/sync-all-wallets.ts
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!process.env.ALCHEMY_API_KEY) {
    console.warn('WARNING: ALCHEMY_API_KEY is not set — Base/Optimism will be skipped');
  }
  if (!process.env.ETHERSCAN_API_KEY) {
    console.warn('WARNING: ETHERSCAN_API_KEY is not set');
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('id, address, label, last_synced_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!wallets?.length) {
    console.log('No wallets found in database.');
    return;
  }

  console.log(`Found ${wallets.length} wallet(s). Starting full sync...\n`);

  // Dynamic import after env is loaded (tsx --env-file)
  const { getSyncEngine } = await import('../src/lib/blockchain/sync-engine');
  const engine = getSyncEngine();

  for (const w of wallets) {
    console.log(`── Syncing ${w.address} (${w.id}) ──`);
    try {
      // Clear stuck syncing flag if any
      await supabase.from('wallets').update({ is_syncing: false }).eq('id', w.id);

      const result = await engine.fullSync(w.id);
      console.log(
        JSON.stringify(
          {
            success: result.overallSuccess,
            address: result.address,
            records: result.totalRecordsSynced,
            durationMs: result.totalDurationMs,
            providers: result.results.map(r => `${r.dataType}:${r.provider}=${r.recordsSynced}`),
            errors: result.results.flatMap(r => r.errors).filter(Boolean),
          },
          null,
          2,
        ),
      );
    } catch (err) {
      console.error(`Failed ${w.address}:`, err);
    }
    console.log('');
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
