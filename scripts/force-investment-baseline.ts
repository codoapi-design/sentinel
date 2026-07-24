/**
 * Force-create investment-return baseline lots for one wallet from current asset_positions.
 * Usage: npx tsx --env-file=.env.local scripts/force-investment-baseline.ts <walletId>
 *
 * Does not import Next.js modules (createServerClient pulls next/headers).
 */

import { createClient } from '@supabase/supabase-js';

const DUST_USD_THRESHOLD = 0.01;
const QTY_EPS = 1e-12;

const walletId = process.argv[2];
if (!walletId) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/force-investment-baseline.ts <walletId>');
  process.exit(1);
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function isEligible(p: {
  is_spam?: boolean | null;
  value_usd?: number | null;
  price_usd?: number | null;
  balance?: string | number | null;
}): boolean {
  if (p.is_spam === true) return false;
  const qty = typeof p.balance === 'number' ? p.balance : Number(p.balance);
  if (!Number.isFinite(qty) || qty <= QTY_EPS) return false;
  const value = Number(p.value_usd) || 0;
  if (value < DUST_USD_THRESHOLD) return false;
  const price = Number(p.price_usd);
  if ((!Number.isFinite(price) || price <= 0) && value <= DUST_USD_THRESHOLD) return false;
  return true;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  // Clear stuck sync + reset baseline markers
  const { data: wallet, error: wErr } = await supabase
    .from('wallets')
    .update({
      is_syncing: false,
      investment_baseline_at: null,
      investment_baseline_value_usd: null,
      updated_at: now,
    })
    .eq('id', walletId)
    .select('id, user_id, address')
    .single();

  if (wErr || !wallet) {
    throw new Error(`Wallet not found: ${wErr?.message || walletId}`);
  }

  const { error: delErr } = await supabase
    .from('investment_lots')
    .delete()
    .eq('wallet_id', walletId);
  if (delErr) throw new Error(`Failed clearing lots: ${delErr.message}`);

  const { data: positions, error: posErr } = await supabase
    .from('asset_positions')
    .select('*')
    .eq('wallet_id', walletId);
  if (posErr) throw new Error(`positions: ${posErr.message}`);

  const eligible = (positions || []).filter(isEligible);
  let baselineValue = 0;
  const rows = eligible.map(p => {
    const qty = typeof p.balance === 'number' ? p.balance : Number(p.balance);
    const valueUsd = Number(p.value_usd) || 0;
    const priceUsd =
      Number(p.price_usd) > 0 ? Number(p.price_usd) : qty > 0 ? valueUsd / qty : 0;
    const costBasis = roundUsd(qty * priceUsd);
    baselineValue += costBasis;
    return {
      user_id: wallet.user_id,
      wallet_id: walletId,
      token_symbol: p.token_symbol || 'UNKNOWN',
      token_address: p.token_address,
      network: (p.network || p.chain || 'ethereum').toLowerCase(),
      chain_id: p.chain_id || 1,
      quantity_open: qty,
      cost_per_unit_usd: priceUsd,
      cost_basis_usd: costBasis,
      closed_cost_basis_usd: 0,
      opened_at: now,
      source: 'baseline',
      closed_at: null,
      realized_pnl_usd: 0,
      status: 'open',
      updated_at: now,
    };
  });

  if (rows.length > 0) {
    const { error: insertErr } = await supabase.from('investment_lots').insert(rows);
    if (insertErr) throw new Error(`insert lots: ${insertErr.message}`);
  }

  const { error: updErr } = await supabase
    .from('wallets')
    .update({
      investment_baseline_at: now,
      investment_baseline_value_usd: roundUsd(baselineValue),
      updated_at: now,
    })
    .eq('id', walletId);
  if (updErr) throw new Error(`wallet baseline update: ${updErr.message}`);

  const { count: lotsCount } = await supabase
    .from('investment_lots')
    .select('id', { count: 'exact', head: true })
    .eq('wallet_id', walletId);

  const { data: refreshed } = await supabase
    .from('wallets')
    .select('investment_baseline_at, investment_baseline_value_usd, is_syncing')
    .eq('id', walletId)
    .single();

  console.log(
    JSON.stringify(
      {
        walletId,
        address: wallet.address,
        positionsTotal: positions?.length ?? 0,
        eligibleLots: rows.length,
        lotsCount: lotsCount ?? 0,
        baseline: refreshed,
        expectedCard:
          rows.length > 0
            ? `+$${0.0.toFixed(2)} (+0.00%) until prices move`
            : 'tracking active with $0 / 0% (no eligible positions)',
      },
      null,
      2,
    ),
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
