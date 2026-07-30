/**
 * Radareum AI — Wallet Context Loader
 *
 * The only place in the agent runtime that touches the database. Part 3 §3.2
 * layering is enforced here:
 *
 *   AI → Business Tools → Application Service → Supabase → Postgres
 *
 * The model never sees a table name, a column, or a query. It calls tools; the
 * tools read a `WalletContext` that this module assembled once per request.
 *
 * Guarantees:
 * - Ownership is verified before any wallet data is read.
 * - Every source is loaded at most once (no N+1); the heavy per-wallet details
 *   are opt-in through `scope`.
 * - Transaction history is capped at `TRANSACTION_LOAD_CAP`; when the cap is
 *   reached the context reports it so `dataQuality` can say so out loud.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_PERIOD_DAYS,
  daysSinceConnected,
  formatPeriodLabel,
  formatSinceConnectedLabel,
  type AssetHolding,
  type IntelligenceInput,
  type IntelligenceTransaction,
  type PortfolioSnapshotPoint,
} from '@/lib/ai/intelligence';
import { resolveCounterpartyDisplay, type ClientNameRef } from '@/lib/clients/display';
import { resolveOnChainActivity } from '@/lib/finance/activity';
import { computeInvestmentReturnDetail, type InvestmentReturnDetail } from '@/lib/finance/investment-return';
import { listPortfolioSnapshots } from '@/lib/finance/portfolio-snapshots';
import { computeFinancialSummary, resolveTypeLabel, type FinancialSummary } from '@/lib/finance/summary';
import { computeTradingVolumeDetail, type TradingVolumeDetail } from '@/lib/finance/trading-volume';
import { filterVisibleTransactions } from '@/lib/finance/visibility';
import type { Client, Transaction } from '@/lib/mock-data';
import { getPricingService } from '@/lib/pricing/service';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

/**
 * Newest-first ceiling on the transactions a single analysis reads.
 *
 * 5,000 rows covers years of activity for a normal wallet while keeping the
 * payload and the engine run bounded for wallets with very large histories.
 * When the wallet holds more, the context is marked `truncated` and every
 * envelope produced from it reports the cap in `dataQuality`.
 */
export const TRANSACTION_LOAD_CAP = 5000;

/** Upper bound on the daily snapshot window, so a very old wallet stays bounded. */
export const SNAPSHOT_LOOKBACK_DAYS = 730;

/** A wallet synced longer ago than this is reported as `stale` to the agent. */
const FRESH_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const NETWORK_LABELS: Record<string, string> = {
  ethereum: 'Ethereum',
  base: 'Base',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  bsc: 'BNB Chain',
  fantom: 'Fantom',
  gnosis: 'Gnosis',
  celo: 'Celo',
  linea: 'Linea',
  scroll: 'Scroll',
  zksync: 'zkSync',
  mantle: 'Mantle',
  blast: 'Blast',
};

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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type WalletContextErrorCode = 'wallet_required' | 'wallet_not_found';

/** Thrown by the loader so routes can map a cause to an HTTP status directly. */
export class WalletContextError extends Error {
  readonly code: WalletContextErrorCode;
  readonly status: number;

  constructor(code: WalletContextErrorCode, message: string) {
    super(message);
    this.name = 'WalletContextError';
    this.code = code;
    this.status = code === 'wallet_required' ? 400 : 404;
  }
}

export function isWalletContextError(error: unknown): error is WalletContextError {
  return error instanceof WalletContextError;
}

// ---------------------------------------------------------------------------
// Period parsing
// ---------------------------------------------------------------------------

const PERIOD_ALIASES: Record<string, number> = {
  '24h': 1,
  today: 1,
  '1d': 1,
  '7d': 7,
  '1w': 7,
  week: 7,
  '14d': 14,
  '30d': 30,
  '1m': 30,
  month: 30,
  '90d': 90,
  '3m': 90,
  quarter: 90,
  '180d': 180,
  '6m': 180,
  '1y': 365,
  '365d': 365,
  year: 365,
  all: SNAPSHOT_LOOKBACK_DAYS,
  max: SNAPSHOT_LOOKBACK_DAYS,
  lifetime: SNAPSHOT_LOOKBACK_DAYS,
};

const PERIOD_UNIT_DAYS: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

/** Normalises the period tokens the UI sends (`30d`, `3m`, `all`, `90`) to days. */
export function parsePeriodDays(period?: string | number | null): number {
  if (typeof period === 'number' && Number.isFinite(period)) {
    return clampDays(Math.round(period));
  }
  if (typeof period !== 'string') return DEFAULT_PERIOD_DAYS;

  const token = period.trim().toLowerCase();
  if (token.length === 0) return DEFAULT_PERIOD_DAYS;

  const alias = PERIOD_ALIASES[token];
  if (alias) return alias;

  if (token === 'ytd') {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 1);
    return clampDays(Math.ceil((now.getTime() - start) / DAY_MS));
  }

  const match = /^(\d+)\s*([dwmy])?$/.exec(token);
  if (match) {
    const amount = Number.parseInt(match[1], 10);
    const unit = PERIOD_UNIT_DAYS[match[2] ?? 'd'] ?? 1;
    if (Number.isFinite(amount) && amount > 0) return clampDays(amount * unit);
  }

  return DEFAULT_PERIOD_DAYS;
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return DEFAULT_PERIOD_DAYS;
  return Math.min(days, SNAPSHOT_LOOKBACK_DAYS * 5);
}

/**
 * True when the UI period means "all time / since connect" rather than a fixed window.
 * Empty and `0` count so Investment Return can map them to days-since-connect.
 */
export function isAllTimeUiPeriod(period?: string | number | null): boolean {
  if (period == null) return true;
  if (typeof period === 'number') return period === 0;
  const token = period.trim().toLowerCase();
  return (
    token.length === 0 ||
    token === '0' ||
    token === 'all' ||
    token === 'max' ||
    token === 'lifetime'
  );
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SyncStatus = 'fresh' | 'stale' | 'syncing' | 'never';

export interface WalletProfile {
  id: string;
  label: string;
  /** Masked primary address — a full address never leaves this layer. */
  addressMasked: string | null;
  /** Every owned address, used to mark internal transfers. Never sent to a model. */
  addresses: string[];
  networks: string[];
  connectedAt: string | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncStatus: SyncStatus;
}

/** Optional, heavier sources. Everything defaults to the cheapest useful load. */
export interface WalletContextScope {
  /** Daily portfolio value points. Default `true`. */
  snapshots?: boolean;
  /** User-defined counterparty names. Default `true`. */
  clients?: boolean;
  /** Lot-level realized / unrealized return. Default `false` (extra queries). */
  investmentReturn?: boolean;
  /** Trade-level volume detail; also loads `raw_data`. Default `false`. */
  tradingVolume?: boolean;
}

export interface LoadWalletContextOptions {
  walletId: string;
  userId: string;
  /** `30d`, `3m`, `all`, or a number of days. Defaults to 30 days. */
  period?: string | number | null;
  scope?: WalletContextScope;
  /** Include spam / dust rows that the list UIs hide. Default `false`. */
  includeHidden?: boolean;
  /** Evaluation instant in epoch ms; pass it to keep a request deterministic. */
  now?: number;
  /** Injectable service-role client, mainly for tests. */
  supabase?: SupabaseClient<Database>;
  /**
   * Narrows intelligence behaviour for dedicated pages (e.g. Investment Return).
   * When `investment_return` and the UI period is all-time, `periodDays` becomes
   * days since wallet connect instead of the 730d snapshot lookback.
   */
  analysisFocus?: IntelligenceInput['analysisFocus'];
}

/** Coverage of the data an analysis was built on, plus the load-time caveats. */
export interface WalletContextCoverage {
  /** Rows read from the database (≤ `TRANSACTION_LOAD_CAP`). */
  loadedTransactionCount: number;
  /** Rows the wallet actually has, when the database reported a count. */
  totalTransactionCount: number | null;
  /** Rows left after the spam / dust visibility rule. */
  visibleTransactionCount: number;
  transactionCap: number;
  /** True when the wallet has more history than the cap allows. */
  truncated: boolean;
  hasSnapshots: boolean;
  hasHoldings: boolean;
  /** Neutral statements about what limits this analysis. */
  notes: string[];
}

export interface WalletContext {
  wallet: WalletProfile;
  /** Every loaded row, newest first, in the app's `Transaction` shape. */
  transactions: IntelligenceTransaction[];
  /** `transactions` minus spam / dust, unless `includeHidden` was set. */
  visibleTransactions: IntelligenceTransaction[];
  assets: AssetHolding[];
  clients: Client[];
  snapshots: PortfolioSnapshotPoint[];
  portfolioValueUsd: number;
  /** The app's cash-flow methodology, reused verbatim (never recomputed here). */
  financialSummary: FinancialSummary;
  investmentReturn: InvestmentReturnDetail | null;
  tradingVolume: TradingVolumeDetail | null;
  ethPriceUsd: number | null;
  periodDays: number;
  /** Human period label for narrative / UI footers (may be `Since connected (Nd)`). */
  periodLabel: string;
  includeHidden: boolean;
  now: number;
  coverage: WalletContextCoverage;
  /** Ready to hand to any engine in `@/lib/ai/intelligence`. */
  intelligenceInput: IntelligenceInput;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

const TRANSACTION_COLUMNS = [
  'id',
  'tx_hash',
  'timestamp',
  'date',
  'type',
  'direction',
  'method_id',
  'method_name',
  'protocol',
  'network',
  'token_symbol',
  'token_name',
  'token_address',
  'token_value',
  'value_eth',
  'value_usd',
  'price_usd',
  'gas_fee_eth',
  'status',
  'from_addr',
  'to_addr',
  'counterparty',
  'counterparty_label',
].join(', ');

interface TransactionRow {
  id: string | null;
  tx_hash: string | null;
  timestamp: number | null;
  date: string | null;
  type: string | null;
  direction: string | null;
  method_id: string | null;
  method_name: string | null;
  protocol: string | null;
  network: string | null;
  token_symbol: string | null;
  token_name: string | null;
  token_address: string | null;
  token_value: number | null;
  value_eth: number | null;
  value_usd: number | null;
  price_usd: number | null;
  gas_fee_eth: number | null;
  status: boolean | null;
  from_addr: string | null;
  to_addr: string | null;
  counterparty: string | null;
  counterparty_label: string | null;
  raw_data?: unknown;
}

interface WalletRow {
  id: string;
  user_id: string;
  address: string | null;
  solana_address: string | null;
  tron_address: string | null;
  bitcoin_address: string | null;
  label: string | null;
  last_synced_at: string | null;
  is_syncing: boolean | null;
  created_at: string | null;
}

interface AssetPositionRow {
  token_symbol: string | null;
  token_name: string | null;
  token_address: string | null;
  balance: string | number | null;
  price_usd: number | null;
  value_usd: number | null;
  network: string | null;
  chain: string | null;
  is_spam: boolean | null;
}

interface ClientRow {
  id: string;
  name: string | null;
  address: string | null;
  notes: string | null;
  color: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Loads everything the intelligence engines need for one wallet, once.
 *
 * @throws {WalletContextError} when the wallet id is missing, or the wallet
 * does not exist for this user — ownership is verified, never assumed.
 */
export async function loadWalletContext(options: LoadWalletContextOptions): Promise<WalletContext> {
  const walletId = options.walletId?.trim();
  const userId = options.userId?.trim();

  if (!walletId || !userId) {
    throw new WalletContextError('wallet_required', 'A wallet id and a user id are required.');
  }

  const supabase = options.supabase ?? createServerClient();
  const now = options.now ?? Date.now();
  let periodDays = parsePeriodDays(options.period);
  let periodLabel = formatPeriodLabel(periodDays);
  const includeHidden = options.includeHidden === true;
  const analysisFocus = options.analysisFocus;

  const scope: Required<WalletContextScope> = {
    snapshots: options.scope?.snapshots !== false,
    clients: options.scope?.clients !== false,
    investmentReturn: options.scope?.investmentReturn === true,
    tradingVolume: options.scope?.tradingVolume === true,
  };

  // ── Ownership gate ──
  const { data: walletData, error: walletError } = await supabase
    .from('wallets')
    .select('id, user_id, address, solana_address, tron_address, bitcoin_address, label, last_synced_at, is_syncing, created_at')
    .eq('id', walletId)
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError || !walletData) {
    throw new WalletContextError('wallet_not_found', 'Wallet not found for this user.');
  }

  const wallet = walletData as unknown as WalletRow;

  const transactionColumns = scope.tradingVolume
    ? `${TRANSACTION_COLUMNS}, raw_data`
    : TRANSACTION_COLUMNS;

  const snapshotFrom = new Date(now - SNAPSHOT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);

  const [transactionsResult, positionsResult, clientsResult, snapshots, ethPriceUsd, investmentReturn] =
    await Promise.all([
      supabase
        .from('transactions')
        .select(transactionColumns, { count: 'exact' })
        .eq('wallet_id', wallet.id)
        .order('timestamp', { ascending: false })
        .limit(TRANSACTION_LOAD_CAP),
      supabase
        .from('asset_positions')
        .select('token_symbol, token_name, token_address, balance, price_usd, value_usd, network, chain, is_spam')
        .eq('wallet_id', wallet.id)
        .order('value_usd', { ascending: false }),
      scope.clients
        ? supabase.from('clients').select('id, name, address, notes, color, created_at').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),
      scope.snapshots ? listPortfolioSnapshots(wallet.id, snapshotFrom) : Promise.resolve([]),
      loadEthPriceUsd(),
      scope.investmentReturn ? loadInvestmentReturn(wallet.id) : Promise.resolve(null),
    ]);

  if (transactionsResult.error) {
    console.error('[AI Context] Failed to load transactions:', transactionsResult.error);
  }
  if (positionsResult.error) {
    console.error('[AI Context] Failed to load asset positions:', positionsResult.error);
  }

  const rows = (transactionsResult.data ?? []) as unknown as TransactionRow[];
  const positions = (positionsResult.data ?? []) as unknown as AssetPositionRow[];
  const clients = mapClients((clientsResult.data ?? []) as unknown as ClientRow[]);

  const assets = positions.map(toAssetHolding).filter(asset => asset.symbol.length > 0);
  const transactions = rows.map(row => toTransaction(row, clients));
  const visibleTransactions = filterVisibleTransactions(transactions, includeHidden);

  const portfolioValueUsd = assets
    .filter(asset => includeHidden || asset.isSpam !== true)
    .reduce((total, asset) => total + (Number.isFinite(asset.valueUsd) ? asset.valueUsd : 0), 0);

  const financialSummary = computeFinancialSummary(rows, { ethPriceUsd });
  const tradingVolume = scope.tradingVolume ? computeTradingVolumeDetail(rows) : null;

  // Investment Return "All" is since-connected, not the 730d snapshot lookback.
  if (
    analysisFocus === 'investment_return' &&
    isAllTimeUiPeriod(options.period) &&
    investmentReturn?.sinceConnectedAt
  ) {
    const sinceDays = daysSinceConnected(investmentReturn.sinceConnectedAt, now);
    if (sinceDays != null) {
      periodDays = sinceDays;
      periodLabel =
        formatSinceConnectedLabel(investmentReturn.sinceConnectedAt, now) ??
        `Since connected (${periodDays}d)`;
    }
  }

  const totalTransactionCount =
    typeof transactionsResult.count === 'number' ? transactionsResult.count : null;
  const truncated = rows.length >= TRANSACTION_LOAD_CAP;

  const walletProfile = toWalletProfile(wallet, transactions, assets, now);

  const coverage: WalletContextCoverage = {
    loadedTransactionCount: transactions.length,
    totalTransactionCount,
    visibleTransactionCount: visibleTransactions.length,
    transactionCap: TRANSACTION_LOAD_CAP,
    truncated,
    hasSnapshots: snapshots.length > 0,
    hasHoldings: assets.length > 0,
    notes: buildCoverageNotes({
      truncated,
      loaded: transactions.length,
      total: totalTransactionCount,
      snapshotCount: snapshots.length,
      holdingCount: assets.length,
      syncStatus: walletProfile.syncStatus,
      includeHidden,
      hiddenCount: transactions.length - visibleTransactions.length,
      investmentReturnLoaded: investmentReturn !== null,
    }),
  };

  const intelligenceInput: IntelligenceInput = {
    // The engines apply the spam / dust rule themselves via `includeHidden`,
    // so they receive the unfiltered set and one visibility decision.
    transactions,
    assets,
    clients,
    portfolioValueUsd: portfolioValueUsd > 0 ? portfolioValueUsd : undefined,
    snapshots,
    investmentReturn: investmentReturn ?? undefined,
    tradingVolume: tradingVolume ?? undefined,
    now,
    periodDays,
    periodLabel,
    analysisFocus,
    includeHidden,
    walletAddresses: walletProfile.addresses,
    ethPriceUsd,
  };

  return {
    wallet: walletProfile,
    transactions,
    visibleTransactions,
    assets,
    clients,
    snapshots,
    portfolioValueUsd,
    financialSummary,
    investmentReturn,
    tradingVolume,
    ethPriceUsd,
    periodDays,
    periodLabel,
    includeHidden,
    now,
    coverage,
    intelligenceInput,
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * DB row → app `Transaction`, matching `/api/wallets/[id]/transactions` so the
 * agent and the transactions table always describe the same row identically.
 * The optional sync-layer fields the engines read are carried alongside.
 */
function toTransaction(row: TransactionRow, clients: ClientNameRef[]): IntelligenceTransaction {
  const network = row.network || 'ethereum';
  const type = (row.type || 'income') as Transaction['type'];
  const counterparty = row.counterparty || row.from_addr || '';

  const counterpartyLabel = resolveCounterpartyDisplay(
    { counterparty, counterpartyLabel: sanitizeLabel(row.counterparty_label, row.protocol) },
    clients
  );

  const tokenValue = numberOrZero(row.token_value);
  const valueUsd = Number.isFinite(row.value_usd) ? Number(row.value_usd) : 0;
  const priceUsd = numberOrZero(row.price_usd);
  const price = priceUsd > 0 ? priceUsd : tokenValue > 0 && valueUsd > 0 ? valueUsd / tokenValue : 0;

  const activity = resolveOnChainActivity({
    direction: row.direction,
    methodId: row.method_id,
    methodName: row.method_name,
    type,
    statusFailed: row.status === false,
  });

  return {
    id: row.id || row.tx_hash || '',
    date: row.date || '',
    timestamp: numberOrZero(row.timestamp),
    type,
    typeLabel: TYPE_LABELS[type] || resolveTypeLabel(type) || type,
    activity,
    methodName: row.method_name,
    direction: row.direction,
    token: row.token_symbol || 'ETH',
    quantity: tokenValue || numberOrZero(row.value_eth),
    price,
    value: valueUsd,
    network,
    networkLabel: NETWORK_LABELS[network] || capitalize(network),
    txHash: row.tx_hash || '',
    counterparty,
    counterpartyLabel,

    // Sync-layer extras the engines read directly.
    valueUsd: row.value_usd,
    gasFeeEth: row.gas_fee_eth,
    methodId: row.method_id,
    protocol: row.protocol,
    from: row.from_addr,
    to: row.to_addr,
    tokenSymbol: row.token_symbol,
    tokenAddress: row.token_address,
    tokenValue: row.token_value,
    priceUsd: row.price_usd,
    status: row.status,
    raw_data: row.raw_data,
  };
}

/** Arabic protocol labels never reach the agent — the UI uses the English form. */
function sanitizeLabel(label: string | null, protocol: string | null): string {
  const candidate = label || protocol || '';
  if (candidate && /[\u0600-\u06FF]/.test(candidate)) return protocol && !/[\u0600-\u06FF]/.test(protocol) ? protocol : '';
  return candidate;
}

function toAssetHolding(row: AssetPositionRow): AssetHolding {
  return {
    symbol: (row.token_symbol || '').trim(),
    name: row.token_name,
    quantity: toNumberOrNull(row.balance),
    priceUsd: row.price_usd,
    valueUsd: numberOrZero(row.value_usd),
    network: row.network || row.chain || 'ethereum',
    tokenAddress: row.token_address,
    isSpam: row.is_spam,
  };
}

function mapClients(rows: ClientRow[]): Client[] {
  return rows
    .filter(row => typeof row?.address === 'string' && row.address.trim().length > 0)
    .map(row => ({
      id: row.id,
      name: (row.name || '').trim(),
      address: (row.address || '').trim(),
      notes: row.notes || '',
      color: row.color || '',
      createdAt: row.created_at || '',
    }));
}

function toWalletProfile(
  row: WalletRow,
  transactions: IntelligenceTransaction[],
  assets: AssetHolding[],
  now: number
): WalletProfile {
  const addresses = [row.address, row.solana_address, row.tron_address, row.bitcoin_address]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());

  const networks = new Set<string>();
  for (const asset of assets) {
    if (asset.network) networks.add(asset.network);
  }
  for (const tx of transactions) {
    if (tx.network) networks.add(tx.network);
  }

  const lastSyncedMs = row.last_synced_at ? Date.parse(row.last_synced_at) : Number.NaN;
  let syncStatus: SyncStatus = 'never';
  if (row.is_syncing) syncStatus = 'syncing';
  else if (Number.isFinite(lastSyncedMs)) {
    syncStatus = now - lastSyncedMs <= FRESH_SYNC_MAX_AGE_MS ? 'fresh' : 'stale';
  }

  return {
    id: row.id,
    label: (row.label || '').trim() || 'Wallet',
    addressMasked: addresses.length > 0 ? maskAddress(addresses[0]) : null,
    addresses,
    networks: [...networks].sort(),
    connectedAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    isSyncing: row.is_syncing === true,
    syncStatus,
  };
}

interface CoverageNoteInput {
  truncated: boolean;
  loaded: number;
  total: number | null;
  snapshotCount: number;
  holdingCount: number;
  syncStatus: SyncStatus;
  includeHidden: boolean;
  hiddenCount: number;
  investmentReturnLoaded: boolean;
}

/** Neutral, factual limitations — never advice, never an apology. */
function buildCoverageNotes(input: CoverageNoteInput): string[] {
  const notes: string[] = [];

  if (input.truncated) {
    const total = input.total !== null ? `${input.total.toLocaleString('en-US')}` : 'more';
    notes.push(
      `Analysis covers the most recent ${input.loaded.toLocaleString('en-US')} transactions of ${total} recorded; older activity is outside this analysis`
    );
  }
  if (input.loaded === 0) {
    notes.push('No transactions are stored for this wallet');
  }
  if (input.snapshotCount === 0) {
    notes.push('No daily portfolio snapshots are stored, so value history is not available');
  }
  if (input.holdingCount === 0) {
    notes.push('No asset positions are stored, so allocation is not available');
  }
  if (input.syncStatus === 'never') {
    notes.push('This wallet has never completed a synchronization');
  } else if (input.syncStatus === 'stale') {
    notes.push('The last wallet synchronization is more than 24 hours old');
  } else if (input.syncStatus === 'syncing') {
    notes.push('A synchronization is currently running, so figures may change');
  }
  if (!input.includeHidden && input.hiddenCount > 0) {
    notes.push(`${input.hiddenCount.toLocaleString('en-US')} spam or dust rows are excluded, matching the transactions table`);
  }
  if (!input.investmentReturnLoaded) {
    notes.push('Cost-basis tracking was not loaded for this request, so realized return is not stated');
  }

  return notes;
}

// ---------------------------------------------------------------------------
// Optional sources
// ---------------------------------------------------------------------------

async function loadEthPriceUsd(): Promise<number | null> {
  try {
    const price = await getPricingService().getCurrentNativePriceUsd(1);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    // Gas in USD simply stays unavailable; nothing else depends on this.
    return null;
  }
}

async function loadInvestmentReturn(walletId: string): Promise<InvestmentReturnDetail | null> {
  try {
    return await computeInvestmentReturnDetail(walletId);
  } catch (error) {
    console.warn('[AI Context] investment return skipped:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function numberOrZero(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function maskAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
