/**
 * Investment return (since connected)
 *
 * Tracks mark-to-market PnL vs cost lots established at wallet connect /
 * first successful portfolio sync — not lifetime on-chain ROI before connect.
 *
 * Soft-fails if investment_lots / wallet baseline columns are missing.
 */

import { createServerClient } from '@/lib/supabase/server';
import { resolveOnChainActivity } from '@/lib/finance/activity';
import { resolveTypeLabel } from '@/lib/finance/summary';
import { DUST_USD_THRESHOLD, isDustAssetValue } from '@/lib/finance/visibility';

const QTY_EPS = 1e-12;
const USD_EPS = 1e-8;

export const INVESTMENT_RETURN_METHODOLOGY =
  'Tracking started at wallet connect / first successful portfolio sync. Mark-to-market vs lot cost basis since then — not lifetime on-chain ROI before connect. Gas does not create lots.';

export type InvestmentLotSource = 'baseline' | 'receive' | 'swap' | 'sync';
export type InvestmentLotStatus = 'open' | 'closed';

export interface InvestmentReturnResult {
  totalPnlUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  costBasisOpenUsd: number;
  costBasisClosedUsd: number;
  marketValueOpenUsd: number;
  returnPct: number | null;
  methodology: string;
  lotsCount: number;
  openLotsCount: number;
  sinceConnectedAt: string | null;
  baselineValueUsd: number | null;
  trackingActive: boolean;
}

export type InvestmentAssetStatus = 'open' | 'closed' | 'mixed';

export interface InvestmentReturnAsset {
  key: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  network: string;
  chainId: number;
  status: InvestmentAssetStatus;
  quantityOpen: number;
  costBasisOpenUsd: number;
  costBasisClosedUsd: number;
  marketValueOpenUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  totalPnlUsd: number;
  returnPct: number | null;
  openedAt: string;
  closedAt: string | null;
  periodLabel: string;
  durationLabel: string;
  durationDays: number;
  lotsCount: number;
}

export interface InvestmentReturnHistoryPoint {
  date: string;
  totalPnlUsd: number;
}

export interface InvestmentReturnDetail extends InvestmentReturnResult {
  assets: InvestmentReturnAsset[];
  history: InvestmentReturnHistoryPoint[];
  historySource: 'daily' | 'portfolio_approx' | 'padded' | 'empty';
  historyMethodology: string;
}

export type InvestmentAssetStoryKind = 'baseline' | 'transaction' | 'current';

export interface InvestmentAssetStoryEvent {
  id: string;
  kind: InvestmentAssetStoryKind;
  at: string;
  activity: string;
  classification: string | null;
  quantity: number;
  valueUsd: number;
  valueImplication: string;
  txHash: string | null;
  direction: string | null;
  network: string;
}

export interface InvestmentReturnAssetDetail {
  trackingActive: boolean;
  sinceConnectedAt: string | null;
  methodology: string;
  historyMethodology: string;
  historySource: 'lot_lifecycle' | 'padded' | 'empty';
  asset: InvestmentReturnAsset;
  history: InvestmentReturnHistoryPoint[];
  story: InvestmentAssetStoryEvent[];
}

export interface InvestmentReturnAssetQuery {
  symbol: string;
  address?: string | null;
  chainId?: number | null;
  network?: string | null;
}

type AssetPositionRow = {
  wallet_id: string;
  user_id: string;
  token_symbol: string;
  token_address: string | null;
  network?: string | null;
  chain?: string | null;
  chain_id?: number | null;
  balance: string | number;
  price_usd: number | null;
  value_usd: number | null;
  is_spam?: boolean | null;
};

type LotRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  token_symbol: string;
  token_address: string | null;
  network: string;
  chain_id: number;
  quantity_open: number;
  cost_per_unit_usd: number;
  cost_basis_usd: number;
  closed_cost_basis_usd: number;
  opened_at: string;
  source: InvestmentLotSource;
  closed_at: string | null;
  realized_pnl_usd: number;
  status: InvestmentLotStatus;
};

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) < QTY_EPS) return 0;
  return n;
}

function tokenKey(network: string, tokenAddress: string | null, symbol: string): string {
  const addr = (tokenAddress || '').trim().toLowerCase();
  if (addr) return `${network.toLowerCase()}|${addr}`;
  return `${network.toLowerCase()}|sym:${symbol.toUpperCase()}`;
}

function positionNetwork(p: AssetPositionRow): string {
  return (p.network || p.chain || 'ethereum').toLowerCase();
}

function positionQty(p: AssetPositionRow): number {
  const q = typeof p.balance === 'number' ? p.balance : Number(p.balance);
  return Number.isFinite(q) ? Math.max(0, q) : 0;
}

function isEligiblePosition(p: AssetPositionRow): boolean {
  if (p.is_spam === true) return false;
  if (isDustAssetValue({
    is_spam: p.is_spam,
    value_usd: p.value_usd,
    price_usd: p.price_usd,
  })) return false;
  const qty = positionQty(p);
  if (qty <= QTY_EPS) return false;
  const value = Number(p.value_usd) || 0;
  if (value < DUST_USD_THRESHOLD) return false;
  return true;
}

function emptyResult(): InvestmentReturnResult {
  return {
    totalPnlUsd: 0,
    unrealizedPnlUsd: 0,
    realizedPnlUsd: 0,
    costBasisOpenUsd: 0,
    costBasisClosedUsd: 0,
    marketValueOpenUsd: 0,
    returnPct: null,
    methodology: INVESTMENT_RETURN_METHODOLOGY,
    lotsCount: 0,
    openLotsCount: 0,
    sinceConnectedAt: null,
    baselineValueUsd: null,
    trackingActive: false,
  };
}

/** True only when the investment-return schema is missing — not every error mentioning the table. */
function isMissingRelationError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const mentionsFeature =
    m.includes('investment_lots') ||
    m.includes('investment_baseline') ||
    m.includes('investment_return_daily');
  if (!mentionsFeature) {
    // Generic "relation does not exist" without our table name — don't hide unrelated failures
    return false;
  }
  return (
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('could not find the table') ||
    (m.includes('could not find the') && m.includes('column'))
  );
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function durationBetween(fromIso: string, toIso: string): { days: number; label: string } {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { days: 0, label: '—' };
  }
  const days = Math.max(0, Math.round((to - from) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return { days: 0, label: '<1 day' };
  if (days === 1) return { days: 1, label: '1 day' };
  if (days < 60) return { days, label: `${days} days` };
  const months = Math.round(days / 30.437);
  if (months < 24) return { days, label: months === 1 ? '1 month' : `${months} months` };
  const years = Math.round(days / 365.25);
  return { days, label: years === 1 ? '1 year' : `${years} years` };
}

/** If no lots exist yet, snapshot current visible positions as baseline lots. */
export async function ensureBaselineLots(walletId: string): Promise<boolean> {
  try {
    const supabase = createServerClient();

    const { count, error: countErr } = await supabase
      .from('investment_lots')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_id', walletId);

    if (countErr) {
      if (isMissingRelationError(countErr.message)) {
        console.warn(
          '[InvestmentReturn] investment_lots missing — baseline skipped (run add-investment-return-lots.sql)',
        );
      } else {
        console.warn('[InvestmentReturn] baseline count failed:', countErr.message);
      }
      return false;
    }
    if ((count ?? 0) > 0) return true;

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('id, user_id, investment_baseline_at, investment_baseline_value_usd')
      .eq('id', walletId)
      .maybeSingle();

    if (walletErr || !wallet) {
      if (walletErr) {
        if (isMissingRelationError(walletErr.message)) {
          console.warn('[InvestmentReturn] baseline columns missing on wallets:', walletErr.message);
        } else {
          console.warn('[InvestmentReturn] wallet read failed:', walletErr.message);
        }
      } else {
        console.warn(`[InvestmentReturn] wallet ${walletId} not found for baseline`);
      }
      return false;
    }

    // Already baselined but lots wiped? Don't recreate from a later portfolio.
    if (wallet.investment_baseline_at) {
      console.warn(
        `[InvestmentReturn] wallet ${walletId} has baseline_at but 0 lots — tracking active with empty cost basis`,
      );
      return true;
    }

    const { data: positions, error: posErr } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', walletId);

    if (posErr) {
      console.warn('[InvestmentReturn] positions read failed:', posErr.message);
      return false;
    }

    const eligible = (positions || []).filter(isEligiblePosition);
    const now = new Date().toISOString();
    let baselineValue = 0;

    const rows = eligible.map(p => {
      const qty = positionQty(p);
      const valueUsd = Number(p.value_usd) || 0;
      const priceUsd =
        Number(p.price_usd) > 0
          ? Number(p.price_usd)
          : qty > 0
            ? valueUsd / qty
            : 0;
      const costBasis = roundUsd(qty * priceUsd);
      baselineValue += costBasis;
      return {
        user_id: wallet.user_id,
        wallet_id: walletId,
        token_symbol: p.token_symbol || 'UNKNOWN',
        token_address: p.token_address,
        network: positionNetwork(p),
        chain_id: p.chain_id || 1,
        quantity_open: qty,
        cost_per_unit_usd: priceUsd,
        cost_basis_usd: costBasis,
        closed_cost_basis_usd: 0,
        opened_at: now,
        source: 'baseline' as const,
        closed_at: null,
        realized_pnl_usd: 0,
        status: 'open' as const,
        updated_at: now,
      };
    });

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('investment_lots').insert(rows);
      if (insertErr) {
        console.warn('[InvestmentReturn] baseline insert failed:', insertErr.message);
        return false;
      }
    }

    // Even with zero eligible positions, mark baseline so we don't treat later
    // receives as a "connect" snapshot of the whole bag.
    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        investment_baseline_at: now,
        investment_baseline_value_usd: roundUsd(baselineValue),
        updated_at: now,
      })
      .eq('id', walletId);

    if (updateErr) {
      // Column may be missing — lots alone still work
      if (isMissingRelationError(updateErr.message)) {
        console.warn(
          '[InvestmentReturn] baseline wallet columns missing — lots inserted but marker not set:',
          updateErr.message,
        );
      } else {
        console.warn('[InvestmentReturn] baseline wallet update failed:', updateErr.message);
        // Lots inserted but marker failed — still treat as partial success if we have lots
        if (rows.length === 0) return false;
      }
    }

    console.log(
      `[InvestmentReturn] baseline created for wallet ${walletId}: ${rows.length} lots, $${roundUsd(baselineValue)}`,
    );
    return true;
  } catch (err) {
    console.warn('[InvestmentReturn] ensureBaselineLots error:', err);
    return false;
  }
}

/**
 * Reconcile open lots vs current asset_positions after a sync.
 * Qty up → new lot at market; qty down → FIFO close with realized PnL.
 */
export async function reconcileInvestmentLots(walletId: string): Promise<boolean> {
  try {
    const supabase = createServerClient();

    // Ensure baseline exists first (idempotent)
    const ok = await ensureBaselineLots(walletId);
    if (!ok) return false;

    const { data: openLots, error: lotsErr } = await supabase
      .from('investment_lots')
      .select('*')
      .eq('wallet_id', walletId)
      .eq('status', 'open')
      .order('opened_at', { ascending: true });

    if (lotsErr) {
      if (!isMissingRelationError(lotsErr.message)) {
        console.warn('[InvestmentReturn] open lots read failed:', lotsErr.message);
      }
      return false;
    }

    const { data: positions, error: posErr } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', walletId);

    if (posErr) {
      console.warn('[InvestmentReturn] reconcile positions failed:', posErr.message);
      return false;
    }

    const eligible = (positions || []).filter(isEligiblePosition);
    const currentByKey = new Map<
      string,
      { qty: number; priceUsd: number; symbol: string; address: string | null; network: string; chainId: number; userId: string }
    >();

    for (const p of eligible) {
      const network = positionNetwork(p);
      const key = tokenKey(network, p.token_address, p.token_symbol);
      const qty = positionQty(p);
      const valueUsd = Number(p.value_usd) || 0;
      const priceUsd =
        Number(p.price_usd) > 0
          ? Number(p.price_usd)
          : qty > 0
            ? valueUsd / qty
            : 0;
      const existing = currentByKey.get(key);
      if (existing) {
        existing.qty += qty;
        // Prefer non-zero price
        if (priceUsd > 0) existing.priceUsd = priceUsd;
      } else {
        currentByKey.set(key, {
          qty,
          priceUsd,
          symbol: p.token_symbol || 'UNKNOWN',
          address: p.token_address,
          network,
          chainId: p.chain_id || 1,
          userId: p.user_id,
        });
      }
    }

    const lotsByKey = new Map<string, LotRow[]>();
    for (const raw of openLots || []) {
      const lot = normalizeLot(raw);
      const key = tokenKey(lot.network, lot.token_address, lot.token_symbol);
      const list = lotsByKey.get(key) || [];
      list.push(lot);
      lotsByKey.set(key, list);
    }

    const now = new Date().toISOString();
    const allKeys = new Set([...currentByKey.keys(), ...lotsByKey.keys()]);

    for (const key of allKeys) {
      const current = currentByKey.get(key);
      const lots = (lotsByKey.get(key) || []).slice().sort(
        (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
      );
      const openQty = lots.reduce((s, l) => s + l.quantity_open, 0);
      const targetQty = current?.qty ?? 0;

      if (targetQty + QTY_EPS < openQty) {
        // Reduce / close FIFO
        let toClose = openQty - targetQty;
        const price = current?.priceUsd ?? lots[lots.length - 1]?.cost_per_unit_usd ?? 0;

        for (const lot of lots) {
          if (toClose <= QTY_EPS) break;
          const closeQty = Math.min(lot.quantity_open, toClose);
          if (closeQty <= QTY_EPS) continue;

          const realized = closeQty * (price - lot.cost_per_unit_usd);
          const closedCost = closeQty * lot.cost_per_unit_usd;
          const remaining = roundQty(lot.quantity_open - closeQty);
          const fullyClosed = remaining <= QTY_EPS;

          const { error } = await supabase
            .from('investment_lots')
            .update({
              quantity_open: fullyClosed ? 0 : remaining,
              cost_basis_usd: fullyClosed ? 0 : roundUsd(remaining * lot.cost_per_unit_usd),
              closed_cost_basis_usd: roundUsd(lot.closed_cost_basis_usd + closedCost),
              realized_pnl_usd: roundUsd(lot.realized_pnl_usd + realized),
              status: fullyClosed ? 'closed' : 'open',
              closed_at: fullyClosed ? now : lot.closed_at,
              updated_at: now,
            })
            .eq('id', lot.id);

          if (error) {
            console.warn('[InvestmentReturn] lot close update failed:', error.message);
          }

          lot.quantity_open = fullyClosed ? 0 : remaining;
          lot.realized_pnl_usd += realized;
          lot.closed_cost_basis_usd += closedCost;
          toClose = roundQty(toClose - closeQty);
        }
      } else if (targetQty > openQty + QTY_EPS && current) {
        // Increase → open new lot at market for delta (receive / airdrop / swap-in)
        const delta = roundQty(targetQty - openQty);
        const price = current.priceUsd;
        if (delta > QTY_EPS && price >= 0) {
          const { error } = await supabase.from('investment_lots').insert({
            user_id: current.userId,
            wallet_id: walletId,
            token_symbol: current.symbol,
            token_address: current.address,
            network: current.network,
            chain_id: current.chainId,
            quantity_open: delta,
            cost_per_unit_usd: price,
            cost_basis_usd: roundUsd(delta * price),
            closed_cost_basis_usd: 0,
            opened_at: now,
            source: openQty <= QTY_EPS ? 'receive' : 'sync',
            closed_at: null,
            realized_pnl_usd: 0,
            status: 'open',
            updated_at: now,
          });
          if (error) {
            console.warn('[InvestmentReturn] new lot insert failed:', error.message);
          }
        }
      }
      // Equal qty: unrealized computed live from prices — no write needed
    }

    return true;
  } catch (err) {
    console.warn('[InvestmentReturn] reconcileInvestmentLots error:', err);
    return false;
  }
}

/** Soft-fail wrapper for sync engine: baseline + reconcile after balances. */
export async function syncInvestmentReturnAfterBalances(walletId: string): Promise<void> {
  try {
    const ok = await reconcileInvestmentLots(walletId);
    if (!ok) {
      console.warn(
        `[InvestmentReturn] post-sync update FAILED for wallet ${walletId} — UI may show "Tracking starts after first sync" until baseline succeeds`,
      );
      return;
    }
    // Persist today's cumulative PnL for the detail chart (soft-fail if table missing).
    try {
      const summary = await computeInvestmentReturn(walletId);
      if (summary.trackingActive) {
        await upsertInvestmentReturnDaily(walletId, summary);
      }
    } catch (snapErr) {
      console.warn('[InvestmentReturn] daily snapshot skipped:', snapErr);
    }
  } catch (err) {
    console.warn(
      `[InvestmentReturn] post-sync update skipped for wallet ${walletId}:`,
      err,
    );
  }
}

/** Upsert today's total PnL into investment_return_daily. Soft-fails if table missing. */
export async function upsertInvestmentReturnDaily(
  walletId: string,
  summary: Pick<
    InvestmentReturnResult,
    'totalPnlUsd' | 'unrealizedPnlUsd' | 'realizedPnlUsd' | 'trackingActive'
  >,
): Promise<boolean> {
  if (!summary.trackingActive) return false;
  try {
    const supabase = createServerClient();
    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('id, user_id')
      .eq('id', walletId)
      .maybeSingle();

    if (walletErr || !wallet) {
      if (walletErr && !isMissingRelationError(walletErr.message)) {
        console.warn('[InvestmentReturn] daily upsert wallet read failed:', walletErr.message);
      }
      return false;
    }

    const snapshotDate = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const { error } = await supabase.from('investment_return_daily').upsert(
      {
        wallet_id: walletId,
        user_id: wallet.user_id,
        snapshot_date: snapshotDate,
        total_pnl_usd: roundUsd(summary.totalPnlUsd),
        unrealized_pnl_usd: roundUsd(summary.unrealizedPnlUsd),
        realized_pnl_usd: roundUsd(summary.realizedPnlUsd),
        source: 'sync',
        updated_at: now,
      },
      { onConflict: 'wallet_id,snapshot_date' },
    );

    if (error) {
      if (isMissingRelationError(error.message)) {
        console.warn(
          '[InvestmentReturn] investment_return_daily missing — chart history skipped (run add-investment-return-daily.sql)',
        );
      } else {
        console.warn('[InvestmentReturn] daily upsert failed:', error.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[InvestmentReturn] upsertInvestmentReturnDaily error:', err);
    return false;
  }
}

function buildAssetBreakdown(
  lots: LotRow[],
  priceByKey: Map<string, number>,
  nowIso: string,
): InvestmentReturnAsset[] {
  const byKey = new Map<string, LotRow[]>();
  for (const lot of lots) {
    const key = tokenKey(lot.network, lot.token_address, lot.token_symbol);
    const list = byKey.get(key) || [];
    list.push(lot);
    byKey.set(key, list);
  }

  const assets: InvestmentReturnAsset[] = [];

  for (const [key, assetLots] of byKey) {
    const first = assetLots[0];
    let quantityOpen = 0;
    let costBasisOpenUsd = 0;
    let costBasisClosedUsd = 0;
    let realizedPnlUsd = 0;
    let openedAt = assetLots[0].opened_at;
    let latestClosedAt: string | null = null;
    let hasOpen = false;
    let hasClosed = false;

    for (const lot of assetLots) {
      if (lot.opened_at < openedAt) openedAt = lot.opened_at;
      realizedPnlUsd += lot.realized_pnl_usd;
      costBasisClosedUsd += lot.closed_cost_basis_usd;

      if (lot.status === 'open' && lot.quantity_open > QTY_EPS) {
        hasOpen = true;
        quantityOpen += lot.quantity_open;
        costBasisOpenUsd += lot.cost_basis_usd;
      }
      if (lot.status === 'closed' || lot.closed_cost_basis_usd > USD_EPS || lot.closed_at) {
        hasClosed = true;
        if (lot.closed_at && (!latestClosedAt || lot.closed_at > latestClosedAt)) {
          latestClosedAt = lot.closed_at;
        }
      }
    }

    const price = priceByKey.get(key) ?? first.cost_per_unit_usd;
    const marketValueOpenUsd = hasOpen ? quantityOpen * price : 0;
    const unrealizedPnlUsd = marketValueOpenUsd - costBasisOpenUsd;
    const totalPnlUsd = unrealizedPnlUsd + realizedPnlUsd;

    let status: InvestmentAssetStatus = 'closed';
    if (hasOpen && hasClosed) status = 'mixed';
    else if (hasOpen) status = 'open';
    else status = 'closed';

    const closedAt = status === 'closed' ? latestClosedAt : null;
    const endIso = closedAt || nowIso;
    const { days, label: durationLabel } = durationBetween(openedAt, endIso);
    const periodLabel =
      status === 'closed' && closedAt
        ? `From ${formatDateShort(openedAt)} to ${formatDateShort(closedAt)}`
        : `From ${formatDateShort(openedAt)} to now`;

    const capitalBase = costBasisOpenUsd + costBasisClosedUsd;
    const returnPct =
      capitalBase > USD_EPS ? (totalPnlUsd / capitalBase) * 100 : null;

    assets.push({
      key,
      tokenSymbol: first.token_symbol,
      tokenAddress: first.token_address,
      network: first.network,
      chainId: first.chain_id,
      status,
      quantityOpen: roundQty(quantityOpen),
      costBasisOpenUsd: roundUsd(costBasisOpenUsd),
      costBasisClosedUsd: roundUsd(costBasisClosedUsd),
      marketValueOpenUsd: roundUsd(marketValueOpenUsd),
      unrealizedPnlUsd: roundUsd(unrealizedPnlUsd),
      realizedPnlUsd: roundUsd(realizedPnlUsd),
      totalPnlUsd: roundUsd(totalPnlUsd),
      returnPct: returnPct != null ? Math.round(returnPct * 100) / 100 : null,
      openedAt,
      closedAt,
      periodLabel,
      durationLabel,
      durationDays: days,
      lotsCount: assetLots.length,
    });
  }

  assets.sort((a, b) => Math.abs(b.totalPnlUsd) - Math.abs(a.totalPnlUsd));
  return assets;
}

async function loadInvestmentReturnHistory(
  walletId: string,
  sinceConnectedAt: string | null,
  baselineValueUsd: number | null,
  currentTotalPnlUsd: number,
): Promise<{
  history: InvestmentReturnHistoryPoint[];
  historySource: InvestmentReturnDetail['historySource'];
  historyMethodology: string;
}> {
  const baselineDate = sinceConnectedAt ? toDateOnly(sinceConnectedAt) : null;
  const today = new Date().toISOString().slice(0, 10);

  const HISTORY_DAILY =
    'Daily cumulative total PnL recorded on each successful sync after connect.';
  const HISTORY_APPROX =
    'Estimated from portfolio value snapshots minus baseline value — approximate until daily return snapshots accumulate.';
  const HISTORY_PADDED =
    'Limited history so far — chart includes connect-day baseline at $0 and today\'s mark-to-market PnL.';

  try {
    const supabase = createServerClient();
    let q = supabase
      .from('investment_return_daily')
      .select('snapshot_date, total_pnl_usd')
      .eq('wallet_id', walletId)
      .order('snapshot_date', { ascending: true });
    if (baselineDate) q = q.gte('snapshot_date', baselineDate);

    const { data, error } = await q;
    if (error) {
      if (!isMissingRelationError(error.message)) {
        console.warn('[InvestmentReturn] daily history read failed:', error.message);
      }
    } else if (data && data.length > 0) {
      let history: InvestmentReturnHistoryPoint[] = data.map(r => ({
        date: String(r.snapshot_date).slice(0, 10),
        totalPnlUsd: roundUsd(Number(r.total_pnl_usd) || 0),
      }));
      history = ensureBaselineAndToday(history, baselineDate, today, currentTotalPnlUsd);
      return {
        history,
        historySource: history.length <= 2 && data.length <= 1 ? 'padded' : 'daily',
        historyMethodology:
          history.length <= 2 && data.length <= 1 ? HISTORY_PADDED : HISTORY_DAILY,
      };
    }

    // Fallback: approximate from portfolio_snapshots − baseline value
    if (baselineDate && baselineValueUsd != null && baselineValueUsd > 0) {
      let snapQ = supabase
        .from('portfolio_snapshots')
        .select('snapshot_date, total_value_usd')
        .eq('wallet_id', walletId)
        .order('snapshot_date', { ascending: true })
        .gte('snapshot_date', baselineDate);
      const { data: snaps, error: snapErr } = await snapQ;
      if (!snapErr && snaps && snaps.length > 0) {
        let history: InvestmentReturnHistoryPoint[] = snaps.map(r => ({
          date: String(r.snapshot_date).slice(0, 10),
          totalPnlUsd: roundUsd((Number(r.total_value_usd) || 0) - baselineValueUsd),
        }));
        history = ensureBaselineAndToday(history, baselineDate, today, currentTotalPnlUsd);
        return {
          history,
          historySource: 'portfolio_approx',
          historyMethodology: HISTORY_APPROX,
        };
      }
    }
  } catch (err) {
    console.warn('[InvestmentReturn] loadInvestmentReturnHistory error:', err);
  }

  // Minimal pad: baseline $0 → today current PnL
  if (baselineDate) {
    const history = ensureBaselineAndToday([], baselineDate, today, currentTotalPnlUsd);
    return {
      history,
      historySource: history.length > 0 ? 'padded' : 'empty',
      historyMethodology: HISTORY_PADDED,
    };
  }

  return {
    history: [],
    historySource: 'empty',
    historyMethodology: 'No return history yet — sync after connecting a wallet to start tracking.',
  };
}

function ensureBaselineAndToday(
  points: InvestmentReturnHistoryPoint[],
  baselineDate: string | null,
  today: string,
  currentTotalPnlUsd: number,
): InvestmentReturnHistoryPoint[] {
  const byDate = new Map<string, number>();
  for (const p of points) {
    byDate.set(p.date, p.totalPnlUsd);
  }
  // Always refresh today's point to live mark-to-market
  byDate.set(today, roundUsd(currentTotalPnlUsd));
  // Pad connect-day at $0 only when it is a different calendar day.
  // If baseline === today, do not overwrite live MTM with 0 (or vice versa) —
  // period filtering treats baseline as the $0 reference separately.
  if (baselineDate && baselineDate !== today && !byDate.has(baselineDate)) {
    byDate.set(baselineDate, 0);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalPnlUsd]) => ({ date, totalPnlUsd }));
}

export async function computeInvestmentReturn(walletId: string): Promise<InvestmentReturnResult> {
  try {
    const supabase = createServerClient();

    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, investment_baseline_at, investment_baseline_value_usd')
      .eq('id', walletId)
      .maybeSingle();

    let { data: lots, error: lotsErr } = await supabase
      .from('investment_lots')
      .select('*')
      .eq('wallet_id', walletId);

    if (lotsErr) {
      if (isMissingRelationError(lotsErr.message)) {
        console.warn(
          '[InvestmentReturn] compute skipped — investment_lots missing (run migration)',
        );
      } else {
        console.warn('[InvestmentReturn] compute lots failed:', lotsErr.message);
      }
      return emptyResult();
    }

    // Heal on read: if never baselined (e.g. stuck sync blocked post-balance update), create now.
    if ((lots || []).length === 0 && !wallet?.investment_baseline_at) {
      const created = await ensureBaselineLots(walletId);
      if (created) {
        const refreshed = await supabase
          .from('investment_lots')
          .select('*')
          .eq('wallet_id', walletId);
        lots = refreshed.data;
      }
    }

    const allLots = (lots || []).map(normalizeLot);
    const { data: walletRow } = await supabase
      .from('wallets')
      .select('id, investment_baseline_at, investment_baseline_value_usd')
      .eq('id', walletId)
      .maybeSingle();

    if (allLots.length === 0 && !walletRow?.investment_baseline_at) {
      return emptyResult();
    }

    const { data: positions } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', walletId);

    const priceByKey = new Map<string, number>();
    for (const p of positions || []) {
      if (!isEligiblePosition(p)) continue;
      const network = positionNetwork(p);
      const key = tokenKey(network, p.token_address, p.token_symbol);
      const qty = positionQty(p);
      const valueUsd = Number(p.value_usd) || 0;
      const priceUsd =
        Number(p.price_usd) > 0
          ? Number(p.price_usd)
          : qty > 0
            ? valueUsd / qty
            : 0;
      if (priceUsd > 0) priceByKey.set(key, priceUsd);
    }

    let costBasisOpenUsd = 0;
    let costBasisClosedUsd = 0;
    let marketValueOpenUsd = 0;
    let realizedPnlUsd = 0;
    let openLotsCount = 0;

    for (const lot of allLots) {
      realizedPnlUsd += lot.realized_pnl_usd;
      costBasisClosedUsd += lot.closed_cost_basis_usd;

      if (lot.status === 'open' && lot.quantity_open > QTY_EPS) {
        openLotsCount += 1;
        costBasisOpenUsd += lot.cost_basis_usd;
        const key = tokenKey(lot.network, lot.token_address, lot.token_symbol);
        const price = priceByKey.get(key) ?? lot.cost_per_unit_usd;
        marketValueOpenUsd += lot.quantity_open * price;
      }
    }

    const unrealizedPnlUsd = marketValueOpenUsd - costBasisOpenUsd;
    const totalPnlUsd = unrealizedPnlUsd + realizedPnlUsd;

    // Preferred denominator: all capital that has been in lots (open + closed cost).
    // Falls back to stored baseline portfolio value, then 0% when tracking with no capital.
    const capitalBase = costBasisOpenUsd + costBasisClosedUsd;
    const baselineValue = Number(walletRow?.investment_baseline_value_usd);
    const denom =
      capitalBase > USD_EPS
        ? capitalBase
        : Number.isFinite(baselineValue) && baselineValue > USD_EPS
          ? baselineValue
          : 0;
    const trackingActive =
      Boolean(walletRow?.investment_baseline_at) || allLots.length > 0;
    const returnPct =
      denom > USD_EPS
        ? (totalPnlUsd / denom) * 100
        : trackingActive
          ? 0
          : null;

    const sinceConnectedAt =
      walletRow?.investment_baseline_at ||
      (allLots.length > 0
        ? allLots.reduce(
            (min, l) => (l.opened_at < min ? l.opened_at : min),
            allLots[0].opened_at,
          )
        : null);

    return {
      totalPnlUsd: roundUsd(totalPnlUsd),
      unrealizedPnlUsd: roundUsd(unrealizedPnlUsd),
      realizedPnlUsd: roundUsd(realizedPnlUsd),
      costBasisOpenUsd: roundUsd(costBasisOpenUsd),
      costBasisClosedUsd: roundUsd(costBasisClosedUsd),
      marketValueOpenUsd: roundUsd(marketValueOpenUsd),
      returnPct: returnPct != null ? Math.round(returnPct * 100) / 100 : null,
      methodology: INVESTMENT_RETURN_METHODOLOGY,
      lotsCount: allLots.length,
      openLotsCount,
      sinceConnectedAt,
      baselineValueUsd:
        Number.isFinite(baselineValue) && baselineValue > 0 ? roundUsd(baselineValue) : null,
      trackingActive,
    };
  } catch (err) {
    console.warn('[InvestmentReturn] computeInvestmentReturn error:', err);
    return emptyResult();
  }
}

/** Full detail payload: summary + per-asset breakdown + chart history. */
export async function computeInvestmentReturnDetail(
  walletId: string,
): Promise<InvestmentReturnDetail> {
  const summary = await computeInvestmentReturn(walletId);
  const emptyDetail = (): InvestmentReturnDetail => ({
    ...summary,
    assets: [],
    history: [],
    historySource: 'empty',
    historyMethodology: 'No return history yet — sync after connecting a wallet to start tracking.',
  });

  if (!summary.trackingActive) {
    return emptyDetail();
  }

  try {
    const supabase = createServerClient();
    const { data: lots, error: lotsErr } = await supabase
      .from('investment_lots')
      .select('*')
      .eq('wallet_id', walletId);

    if (lotsErr) {
      if (!isMissingRelationError(lotsErr.message)) {
        console.warn('[InvestmentReturn] detail lots failed:', lotsErr.message);
      }
      const hist = await loadInvestmentReturnHistory(
        walletId,
        summary.sinceConnectedAt,
        summary.baselineValueUsd,
        summary.totalPnlUsd,
      );
      return { ...summary, assets: [], ...hist };
    }

    const allLots = (lots || []).map(normalizeLot);
    const { data: positions } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', walletId);

    const priceByKey = new Map<string, number>();
    for (const p of positions || []) {
      if (!isEligiblePosition(p)) continue;
      const network = positionNetwork(p);
      const key = tokenKey(network, p.token_address, p.token_symbol);
      const qty = positionQty(p);
      const valueUsd = Number(p.value_usd) || 0;
      const priceUsd =
        Number(p.price_usd) > 0
          ? Number(p.price_usd)
          : qty > 0
            ? valueUsd / qty
            : 0;
      if (priceUsd > 0) priceByKey.set(key, priceUsd);
    }

    const nowIso = new Date().toISOString();
    const assets = buildAssetBreakdown(allLots, priceByKey, nowIso);
    const hist = await loadInvestmentReturnHistory(
      walletId,
      summary.sinceConnectedAt,
      summary.baselineValueUsd,
      summary.totalPnlUsd,
    );

    // Opportunistically persist today's point when reading detail (keeps chart fresh even without sync).
    try {
      await upsertInvestmentReturnDaily(walletId, summary);
    } catch {
      // soft-fail
    }

    return { ...summary, assets, ...hist };
  } catch (err) {
    console.warn('[InvestmentReturn] computeInvestmentReturnDetail error:', err);
    return emptyDetail();
  }
}

function normalizeLot(raw: Record<string, unknown>): LotRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    wallet_id: String(raw.wallet_id),
    token_symbol: String(raw.token_symbol || 'UNKNOWN'),
    token_address: (raw.token_address as string | null) ?? null,
    network: String(raw.network || 'ethereum').toLowerCase(),
    chain_id: Number(raw.chain_id) || 1,
    quantity_open: Number(raw.quantity_open) || 0,
    cost_per_unit_usd: Number(raw.cost_per_unit_usd) || 0,
    cost_basis_usd: Number(raw.cost_basis_usd) || 0,
    closed_cost_basis_usd: Number(raw.closed_cost_basis_usd) || 0,
    opened_at: String(raw.opened_at || new Date().toISOString()),
    source: (raw.source as InvestmentLotSource) || 'baseline',
    closed_at: (raw.closed_at as string | null) ?? null,
    realized_pnl_usd: Number(raw.realized_pnl_usd) || 0,
    status: (raw.status as InvestmentLotStatus) || 'open',
  };
}

function normalizeAddr(addr: string | null | undefined): string {
  return (addr || '').trim().toLowerCase();
}

function lotMatchesQuery(lot: LotRow, query: InvestmentReturnAssetQuery): boolean {
  const qNetwork = (query.network || '').trim().toLowerCase();
  const qAddr = normalizeAddr(query.address);
  const qSymbol = (query.symbol || '').trim().toUpperCase();
  const qChain = query.chainId != null && Number.isFinite(Number(query.chainId))
    ? Number(query.chainId)
    : null;

  if (qNetwork && lot.network !== qNetwork) return false;
  if (qChain != null && lot.chain_id !== qChain) {
    // Allow mismatch only when network already matched and chain was omitted historically
    if (!qNetwork) return false;
  }

  if (qAddr) {
    const lotAddr = normalizeAddr(lot.token_address);
    if (lotAddr) return lotAddr === qAddr;
    // Native / missing address: fall through to symbol
  }

  if (!qSymbol) return false;
  return lot.token_symbol.toUpperCase() === qSymbol;
}

function buildAssetLotHistory(
  assetLots: LotRow[],
  asset: InvestmentReturnAsset,
): {
  history: InvestmentReturnHistoryPoint[];
  historySource: InvestmentReturnAssetDetail['historySource'];
  historyMethodology: string;
} {
  const openDate = toDateOnly(asset.openedAt);
  const today = new Date().toISOString().slice(0, 10);
  const endDate = asset.closedAt ? toDateOnly(asset.closedAt) : today;

  const HISTORY_LOT =
    'Cumulative asset PnL reconstructed from lot lifecycle (open at $0, closes lock realized, live mark-to-market on open qty).';
  const HISTORY_PADDED =
    'Limited asset history — chart includes open-day baseline at $0 and current asset total PnL.';

  const byDate = new Map<string, number>();
  if (openDate) byDate.set(openDate, 0);

  const closedSorted = assetLots
    .filter(l => l.closed_at)
    .slice()
    .sort((a, b) => String(a.closed_at).localeCompare(String(b.closed_at)));

  let cumRealized = 0;
  for (const lot of closedSorted) {
    cumRealized += lot.realized_pnl_usd;
    const d = toDateOnly(lot.closed_at!);
    // At each close, lock cumulative realized (open lots still mark separately at end).
    byDate.set(d, roundUsd(cumRealized));
  }

  if (endDate) {
    byDate.set(endDate, roundUsd(asset.totalPnlUsd));
  }
  // Refresh "today" to live MTM when still held
  if (asset.status !== 'closed') {
    byDate.set(today, roundUsd(asset.totalPnlUsd));
  }

  const history = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalPnlUsd]) => ({ date, totalPnlUsd }));

  const distinct = new Set(history.map(h => h.date)).size;
  const historySource: InvestmentReturnAssetDetail['historySource'] =
    history.length === 0
      ? 'empty'
      : distinct <= 2 && closedSorted.length === 0
        ? 'padded'
        : 'lot_lifecycle';

  return {
    history,
    historySource,
    historyMethodology:
      historySource === 'padded'
        ? HISTORY_PADDED
        : historySource === 'empty'
          ? 'No return history yet for this asset.'
          : HISTORY_LOT,
  };
}

const TYPE_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  trade: 'Trade',
  defi: 'DeFi',
  staking: 'Staking Reward',
  gas: 'Gas Fee',
  nft: 'NFT',
  bridge: 'Bridge',
};

function valueImplicationForTx(direction: string | null, type: string | null): string {
  const dir = (direction || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (dir === 'in' || t === 'income' || t === 'staking') return 'Increased holdings after connect';
  if (dir === 'out' || t === 'expense') return 'Reduced holdings after connect';
  if (t === 'trade' || t === 'defi') return 'Rebalanced via trade / DeFi';
  if (dir === 'self') return 'Internal movement';
  return 'Position change after connect';
}

async function loadAssetStory(
  walletId: string,
  asset: InvestmentReturnAsset,
  assetLots: LotRow[],
  sinceConnectedAt: string | null,
): Promise<InvestmentAssetStoryEvent[]> {
  const story: InvestmentAssetStoryEvent[] = [];
  const sinceIso = sinceConnectedAt || asset.openedAt;
  const sinceTs = Math.floor(new Date(sinceIso).getTime() / 1000);

  // Baseline from lots (qty & USD at connect / first lot open for this asset)
  const baselineLots = assetLots.filter(l => l.source === 'baseline');
  const hasBaseline = baselineLots.length > 0;
  const openingLots = hasBaseline
    ? baselineLots
    : assetLots.filter(l => toDateOnly(l.opened_at) === toDateOnly(asset.openedAt));

  const lotOriginalQty = (l: LotRow): number => {
    const closedQty =
      l.cost_per_unit_usd > USD_EPS ? l.closed_cost_basis_usd / l.cost_per_unit_usd : 0;
    return l.quantity_open + closedQty;
  };

  const baselineAt = openingLots.length
    ? openingLots.reduce((min, l) => (l.opened_at < min ? l.opened_at : min), openingLots[0].opened_at)
    : asset.openedAt;
  const synthQty = roundQty(openingLots.reduce((s, l) => s + lotOriginalQty(l), 0));
  const synthValue = roundUsd(
    openingLots.reduce((s, l) => s + l.cost_basis_usd + l.closed_cost_basis_usd, 0),
  );

  story.push({
    id: 'baseline',
    kind: 'baseline',
    at: baselineAt,
    activity: 'Baseline',
    classification: null,
    quantity: synthQty,
    valueUsd: synthValue,
    valueImplication: hasBaseline
      ? 'Value at wallet connect / first sync'
      : 'Opening cost when first received after connect',
    txHash: null,
    direction: null,
    network: asset.network,
  });

  try {
    const supabase = createServerClient();
    const qAddr = normalizeAddr(asset.tokenAddress);
    const qSymbol = asset.tokenSymbol.toUpperCase();

    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, timestamp, date, type, direction, method_id, method_name, network, token_symbol, token_address, token_value, value_usd, price_usd, tx_hash, status',
      )
      .eq('wallet_id', walletId)
      .eq('network', asset.network)
      .gte('timestamp', Number.isFinite(sinceTs) ? sinceTs : 0)
      .order('timestamp', { ascending: true })
      .limit(500);
    if (error) {
      console.warn('[InvestmentReturn] asset story txs failed:', error.message);
    } else {
      for (const row of data || []) {
        const rowAddr = normalizeAddr(row.token_address as string | null);
        const rowSym = String(row.token_symbol || '').toUpperCase();
        const matchesAddr = qAddr && rowAddr && rowAddr === qAddr;
        const matchesSym = !qAddr
          ? rowSym === qSymbol
          : matchesAddr || (!rowAddr && rowSym === qSymbol);
        if (!matchesAddr && !matchesSym) continue;

        // Skip gas-only rows for unrelated fee tokens unless symbol matches
        if (row.type === 'gas' && rowSym && rowSym !== qSymbol && !matchesAddr) continue;

        const qty = Number(row.token_value) || 0;
        const valueUsd =
          typeof row.value_usd === 'number' && Number.isFinite(row.value_usd)
            ? Number(row.value_usd)
            : 0;
        const txType = String(row.type || '');
        const direction = (row.direction as string | null) || null;
        const activity = resolveOnChainActivity({
          direction,
          methodId: row.method_id as string | null,
          methodName: row.method_name as string | null,
          type: txType,
          statusFailed: row.status === false,
        });

        const atIso =
          typeof row.timestamp === 'number' && row.timestamp > 0
            ? new Date(row.timestamp * 1000).toISOString()
            : String(row.date || sinceIso);

        story.push({
          id: String(row.id || row.tx_hash || `tx-${story.length}`),
          kind: 'transaction',
          at: atIso,
          activity,
          classification: TYPE_LABELS[txType] || resolveTypeLabel(txType) || txType || null,
          quantity: roundQty(qty),
          valueUsd: roundUsd(valueUsd),
          valueImplication: valueImplicationForTx(direction, txType),
          txHash: (row.tx_hash as string) || null,
          direction,
          network: String(row.network || asset.network),
        });
      }
    }
  } catch (err) {
    console.warn('[InvestmentReturn] loadAssetStory error:', err);
  }

  story.push({
    id: 'current',
    kind: 'current',
    at: new Date().toISOString(),
    activity: 'Current',
    classification: null,
    quantity: asset.quantityOpen,
    valueUsd: asset.marketValueOpenUsd,
    valueImplication:
      asset.status === 'closed'
        ? 'Fully exited — no open quantity'
        : 'Mark-to-market value now',
    txHash: null,
    direction: null,
    network: asset.network,
  });

  return story;
}

/**
 * Per-asset investment return detail: summary, lot-lifecycle chart, story timeline.
 */
export async function computeInvestmentReturnAssetDetail(
  walletId: string,
  query: InvestmentReturnAssetQuery,
): Promise<InvestmentReturnAssetDetail | null> {
  const summary = await computeInvestmentReturn(walletId);
  if (!summary.trackingActive) {
    return {
      trackingActive: false,
      sinceConnectedAt: summary.sinceConnectedAt,
      methodology: summary.methodology,
      historyMethodology: 'Tracking not started.',
      historySource: 'empty',
      asset: {
        key: '',
        tokenSymbol: query.symbol || 'UNKNOWN',
        tokenAddress: query.address ?? null,
        network: (query.network || 'ethereum').toLowerCase(),
        chainId: Number(query.chainId) || 1,
        status: 'closed',
        quantityOpen: 0,
        costBasisOpenUsd: 0,
        costBasisClosedUsd: 0,
        marketValueOpenUsd: 0,
        unrealizedPnlUsd: 0,
        realizedPnlUsd: 0,
        totalPnlUsd: 0,
        returnPct: null,
        openedAt: summary.sinceConnectedAt || new Date().toISOString(),
        closedAt: null,
        periodLabel: '—',
        durationLabel: '—',
        durationDays: 0,
        lotsCount: 0,
      },
      history: [],
      story: [],
    };
  }

  try {
    const supabase = createServerClient();
    const { data: lots, error: lotsErr } = await supabase
      .from('investment_lots')
      .select('*')
      .eq('wallet_id', walletId);

    if (lotsErr) {
      if (!isMissingRelationError(lotsErr.message)) {
        console.warn('[InvestmentReturn] asset detail lots failed:', lotsErr.message);
      }
      return null;
    }

    const allLots = (lots || []).map(normalizeLot);
    const matched = allLots.filter(l => lotMatchesQuery(l, query));
    if (matched.length === 0) {
      return null;
    }

    const { data: positions } = await supabase
      .from('asset_positions')
      .select('*')
      .eq('wallet_id', walletId);

    const priceByKey = new Map<string, number>();
    for (const p of positions || []) {
      if (!isEligiblePosition(p)) continue;
      const network = positionNetwork(p);
      const key = tokenKey(network, p.token_address, p.token_symbol);
      const qty = positionQty(p);
      const valueUsd = Number(p.value_usd) || 0;
      const priceUsd =
        Number(p.price_usd) > 0
          ? Number(p.price_usd)
          : qty > 0
            ? valueUsd / qty
            : 0;
      if (priceUsd > 0) priceByKey.set(key, priceUsd);
    }

    const nowIso = new Date().toISOString();
    const assets = buildAssetBreakdown(matched, priceByKey, nowIso);
    const asset = assets[0];
    if (!asset) return null;

    const hist = buildAssetLotHistory(matched, asset);
    const story = await loadAssetStory(
      walletId,
      asset,
      matched,
      summary.sinceConnectedAt,
    );

    return {
      trackingActive: true,
      sinceConnectedAt: summary.sinceConnectedAt,
      methodology: summary.methodology,
      historyMethodology: hist.historyMethodology,
      historySource: hist.historySource,
      asset,
      history: hist.history,
      story,
    };
  } catch (err) {
    console.warn('[InvestmentReturn] computeInvestmentReturnAssetDetail error:', err);
    return null;
  }
}
