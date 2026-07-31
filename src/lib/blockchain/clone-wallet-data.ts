/**
 * Clone on-chain wallet data from an existing address already synced in DB.
 *
 * Used when a user adds an address that another user (or the same user on
 * another account) already synced — avoids a full Alchemy historical pull.
 *
 * Copies: transactions, asset_positions, sync cursors.
 * Does NOT copy: clients, notes, investment_lots, labels, preferences.
 */

import { createServerClient } from '@/lib/supabase/server';
import { syncInvestmentReturnAfterBalances } from '@/lib/finance/investment-return';
import { rebuildWalletReadModels } from '@/lib/finance/wallet-read-models';

const BATCH = 200;

export type CloneWalletResult = {
  cloned: boolean;
  sourceWalletId: string | null;
  transactionsCopied: number;
  positionsCopied: number;
  lastSyncedBlock: number | null;
  lastSyncedAt: string | null;
};

type SourceWallet = {
  id: string;
  last_synced_block: number | null;
  last_synced_at: string | null;
};

/**
 * Find the best already-synced wallet row for this EVM address (any user).
 * Prefers the most recently synced source with transaction history.
 */
export async function findBestSourceWalletForAddress(
  evmAddress: string,
  excludeWalletId?: string,
): Promise<SourceWallet | null> {
  const supabase = createServerClient();
  const addr = evmAddress.toLowerCase();

  let query = supabase
    .from('wallets')
    .select('id, last_synced_block, last_synced_at')
    .ilike('address', addr)
    .not('last_synced_at', 'is', null)
    .order('last_synced_at', { ascending: false })
    .limit(10);

  if (excludeWalletId) {
    query = query.neq('id', excludeWalletId);
  }

  const { data: candidates, error } = await query;
  if (error || !candidates?.length) return null;

  for (const candidate of candidates) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_id', candidate.id);

    if ((count || 0) > 0) {
      return candidate as SourceWallet;
    }
  }

  // Fallback: synced cursor but empty txs (rare) — still useful for incremental start.
  return (candidates[0] as SourceWallet) || null;
}

/**
 * Copy chain history + balances from source wallet into target wallet.
 * Sets sync cursors on the target. Leaves Investment Return unset so the
 * first post-clone baseline is taken from the cloned positions at add time.
 */
export async function cloneWalletChainData(params: {
  sourceWalletId: string;
  targetWalletId: string;
  targetUserId: string;
  sourceLastSyncedBlock: number | null;
  sourceLastSyncedAt: string | null;
}): Promise<CloneWalletResult> {
  const {
    sourceWalletId,
    targetWalletId,
    targetUserId,
    sourceLastSyncedBlock,
    sourceLastSyncedAt,
  } = params;
  const supabase = createServerClient();

  let transactionsCopied = 0;
  let positionsCopied = 0;

  // ── Transactions ──────────────────────────────────────────
  for (let from = 0; ; from += BATCH) {
    const { data: rows, error } = await supabase
      .from('transactions')
      .select(
        'tx_hash, block_number, timestamp, date, from_addr, to_addr, value_wei, value_eth, gas_used, gas_price_wei, gas_fee_eth, status, type, type_ar, direction, method_id, method_name, protocol, protocol_ar, network, network_ar, token_symbol, token_name, token_address, token_value, token_decimals, value_usd, price_usd, counterparty, counterparty_label, raw_data',
      )
      .eq('wallet_id', sourceWalletId)
      .range(from, from + BATCH - 1);

    if (error) {
      console.warn('[CloneWallet] transactions read failed:', error.message);
      break;
    }
    if (!rows?.length) break;

    const inserts = rows.map(row => ({
      ...row,
      wallet_id: targetWalletId,
    }));

    const { error: upsertErr } = await supabase.from('transactions').upsert(inserts, {
      onConflict: 'tx_hash,wallet_id,network',
      ignoreDuplicates: true,
    });
    if (upsertErr) {
      console.warn('[CloneWallet] transactions upsert failed:', upsertErr.message);
    } else {
      transactionsCopied += inserts.length;
    }

    if (rows.length < BATCH) break;
  }

  // ── Asset positions ───────────────────────────────────────
  for (let from = 0; ; from += BATCH) {
    const { data: rows, error } = await supabase
      .from('asset_positions')
      .select(
        'chain, token_address, token_symbol, token_name, token_decimals, balance, balance_raw, value_usd, price_usd, change_24h, network, chain_id, is_spam, is_verified, source, unrealized_pnl_usd, unrealized_pnl_pct, cost_basis_usd, logo_url, provider',
      )
      .eq('wallet_id', sourceWalletId)
      .range(from, from + BATCH - 1);

    if (error) {
      console.warn('[CloneWallet] positions read failed:', error.message);
      break;
    }
    if (!rows?.length) break;

    const inserts = rows.map(row => ({
      ...row,
      wallet_id: targetWalletId,
      user_id: targetUserId,
    }));

    const { error: upsertErr } = await supabase.from('asset_positions').upsert(inserts, {
      onConflict: 'wallet_id,token_address,network',
    });
    if (upsertErr) {
      console.warn('[CloneWallet] positions upsert failed:', upsertErr.message);
    } else {
      positionsCopied += inserts.length;
    }

    if (rows.length < BATCH) break;
  }

  // ── Sync cursors (enables incremental Alchemy, not full history) ──
  // Investment baseline stays null — first IR pass after clone creates lots
  // from the cloned positions (tracking starts at add time).
  let cursorBlock = sourceLastSyncedBlock;
  if (!(typeof cursorBlock === 'number' && cursorBlock > 0) && transactionsCopied > 0) {
    const { data: maxRow } = await supabase
      .from('transactions')
      .select('block_number')
      .eq('wallet_id', targetWalletId)
      .order('block_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (typeof maxRow?.block_number === 'number' && maxRow.block_number > 0) {
      cursorBlock = maxRow.block_number;
    }
  }

  const cursorAt = sourceLastSyncedAt || new Date().toISOString();

  const { error: cursorErr } = await supabase
    .from('wallets')
    .update({
      last_synced_block: cursorBlock,
      last_synced_at: cursorAt,
      investment_baseline_at: null,
      investment_baseline_value_usd: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetWalletId);

  if (cursorErr) {
    console.warn('[CloneWallet] cursor update failed:', cursorErr.message);
  }

  // Establish Investment Return baseline from cloned positions now (add moment).
  try {
    await syncInvestmentReturnAfterBalances(targetWalletId);
  } catch (err) {
    console.warn('[CloneWallet] investment baseline after clone skipped:', err);
  }

  try {
    const rm = await rebuildWalletReadModels(targetWalletId);
    console.log('[CloneWallet] Read models rebuilt:', rm);
  } catch (err) {
    console.warn('[CloneWallet] Read models rebuild skipped:', err);
  }

  return {
    cloned: transactionsCopied > 0 || positionsCopied > 0,
    sourceWalletId,
    transactionsCopied,
    positionsCopied,
    lastSyncedBlock: cursorBlock,
    lastSyncedAt: cursorAt,
  };
}

/**
 * If another wallet already has this address synced, clone into target and
 * return the result. Otherwise return cloned:false.
 */
export async function tryCloneWalletFromExistingAddress(params: {
  evmAddress: string | null | undefined;
  targetWalletId: string;
  targetUserId: string;
}): Promise<CloneWalletResult> {
  const empty: CloneWalletResult = {
    cloned: false,
    sourceWalletId: null,
    transactionsCopied: 0,
    positionsCopied: 0,
    lastSyncedBlock: null,
    lastSyncedAt: null,
  };

  if (!params.evmAddress) return empty;

  const source = await findBestSourceWalletForAddress(
    params.evmAddress,
    params.targetWalletId,
  );
  if (!source) return empty;

  console.log(
    `[CloneWallet] Cloning chain data from ${source.id} → ${params.targetWalletId} ` +
      `(address ${params.evmAddress})`,
  );

  return cloneWalletChainData({
    sourceWalletId: source.id,
    targetWalletId: params.targetWalletId,
    targetUserId: params.targetUserId,
    sourceLastSyncedBlock: source.last_synced_block,
    sourceLastSyncedAt: source.last_synced_at,
  });
}
