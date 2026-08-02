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
 * - Transaction rows may be skipped, aggregated, or loaded under a sync row
 *   budget. Hitting the budget never implies full entitled history — coverage
 *   flags (`truncated`, `isFullEntitledHistory`) must stay honest.
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
import type {
  AiScreenAsset,
  AiScreenClient,
  AiScreenSnapshot,
  AiScreenTransaction,
} from '@/lib/ai-screen-snapshot';
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
import {
  countMatchingTransactions,
  domain,
  loadWalletTransactionAggregates,
  SYNC_TRANSACTION_ROW_BUDGET,
  coverageFromLoad,
  type DataRequirementsPlan,
  type DomainStatus,
  type TransactionAggregateResult,
} from '@/lib/ai/trust';

/**
 * Soft sync row budget for in-memory engine passes.
 * Never present a budget hit as complete entitled history.
 * @deprecated Prefer DataRequirementsPlan + coverage flags.
 */
export const TRANSACTION_LOAD_CAP = SYNC_TRANSACTION_ROW_BUDGET;

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
  /** Package 1 — what domains to load (from provisional planner). */
  dataRequirements?: DataRequirementsPlan;
}

/** Coverage of the data an analysis was built on, plus the load-time caveats. */
export interface WalletContextCoverage {
  /** Rows read from the database for this request. */
  loadedTransactionCount: number;
  /** Rows the wallet actually has, when the database reported a count. */
  totalTransactionCount: number | null;
  /** Rows left after the spam / dust visibility rule. */
  visibleTransactionCount: number;
  /** Soft sync row budget (not an analytical “full history” claim). */
  transactionCap: number;
  /** True when matching entitled rows were not fully processed in-memory. */
  truncated: boolean;
  /** True only when entire entitled transaction scope was processed exactly. */
  isFullEntitledHistory: boolean;
  truncationReason?: string;
  hasSnapshots: boolean;
  hasHoldings: boolean;
  /** Neutral statements about what limits this analysis. */
  notes: string[];
  /** How transactions were loaded for this request. */
  transactionLoadMode?: DataRequirementsPlan['transactions']['mode'];
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
  /** Package 1 domain availability (empty ≠ failed). */
  domainStatuses: DomainStatus[];
  /** Exact aggregates when row load was skipped or incomplete. */
  transactionAggregates?: TransactionAggregateResult | null;
  dataRequirements?: DataRequirementsPlan;
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
  is_verified?: boolean | null;
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

  const dataRequirements: DataRequirementsPlan = options.dataRequirements ?? {
    holdings: true,
    transactions: {
      mode: 'filtered',
      from: new Date(now - periodDays * DAY_MS).toISOString(),
      to: new Date(now).toISOString(),
      maxRows: SYNC_TRANSACTION_ROW_BUDGET,
    },
    snapshots: options.scope?.snapshots !== false,
    clients: options.scope?.clients !== false,
    pricing: true,
    investmentReturn: options.scope?.investmentReturn === true,
    tradingVolume: options.scope?.tradingVolume === true,
  };

  const scope: Required<WalletContextScope> = {
    snapshots: dataRequirements.snapshots && options.scope?.snapshots !== false,
    clients: dataRequirements.clients && options.scope?.clients !== false,
    investmentReturn: dataRequirements.investmentReturn || options.scope?.investmentReturn === true,
    tradingVolume: dataRequirements.tradingVolume || options.scope?.tradingVolume === true,
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
  const domainStatuses: DomainStatus[] = [
    domain('wallet', 'available', { asOf: wallet.last_synced_at ?? undefined }),
  ];

  const transactionColumns = scope.tradingVolume
    ? `${TRANSACTION_COLUMNS}, raw_data`
    : TRANSACTION_COLUMNS;

  const snapshotFrom = new Date(now - SNAPSHOT_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const txPlan = dataRequirements.transactions;
  const loadTxRows = txPlan.mode === 'filtered' || txPlan.mode === 'full_entitled_history';
  const loadTxAggregates = txPlan.mode === 'aggregate' || txPlan.mode === 'full_entitled_history';

  // Same visibility rules as `/api/portfolio` so chat matches the Assets UI.
  let positionsQuery = supabase
    .from('asset_positions')
    .select(
      'token_symbol, token_name, token_address, balance, price_usd, value_usd, network, chain, is_spam, is_verified',
    )
    .eq('wallet_id', wallet.id)
    .gt('value_usd', 0)
    .order('value_usd', { ascending: false });
  if (!includeHidden) {
    positionsQuery = positionsQuery.eq('is_verified', true).eq('is_spam', false);
  }

  const rowBudget =
    txPlan.mode === 'filtered'
      ? txPlan.maxRows ?? SYNC_TRANSACTION_ROW_BUDGET
      : SYNC_TRANSACTION_ROW_BUDGET;

  const emptyTxResult = {
    data: [] as TransactionRow[],
    error: null as { message?: string } | null,
    count: null as number | null,
  };

  const [transactionsResult, positionsResult, clientsResult, snapshots, ethPriceUsd, investmentReturn, aggregates] =
    await Promise.all([
      loadTxRows
        ? (() => {
            let q = supabase
              .from('transactions')
              .select(transactionColumns, { count: 'exact' })
              .eq('wallet_id', wallet.id)
              .order('timestamp', { ascending: false })
              .limit(rowBudget);
            if (txPlan.mode === 'filtered') {
              if (txPlan.asset) q = q.ilike('token_symbol', txPlan.asset);
              if (txPlan.network) q = q.eq('network', txPlan.network);
              if (txPlan.counterparty) q = q.ilike('counterparty', `%${txPlan.counterparty}%`);
              if (txPlan.from) q = q.gte('date', txPlan.from.slice(0, 10));
              if (txPlan.to) q = q.lte('date', txPlan.to.slice(0, 10));
            }
            return q;
          })()
        : Promise.resolve(emptyTxResult),
      dataRequirements.holdings
        ? positionsQuery
        : Promise.resolve({ data: [], error: null }),
      scope.clients
        ? supabase.from('clients').select('id, name, address, notes, color, created_at').eq('user_id', userId)
        : Promise.resolve({ data: [], error: null }),
      scope.snapshots ? listPortfolioSnapshots(wallet.id, snapshotFrom) : Promise.resolve([]),
      dataRequirements.pricing ? loadEthPriceUsd() : Promise.resolve(null),
      scope.investmentReturn ? loadInvestmentReturn(wallet.id) : Promise.resolve(null),
      loadTxAggregates || txPlan.mode === 'none'
        ? loadWalletTransactionAggregates(wallet.id)
        : Promise.resolve(null),
    ]);

  // Domain: transactions
  if (txPlan.mode === 'none') {
    domainStatuses.push(
      domain('transactions', 'not_required', {
        notes: ['Transaction history was not required for this question.'],
      }),
    );
  } else if (transactionsResult.error) {
    console.error('[AI Context] Failed to load transactions:', transactionsResult.error);
    domainStatuses.push(
      domain('transactions', 'unavailable', {
        errorCode: 'TX_LOAD_FAILED',
        notes: ['Transaction retrieval failed; flow findings are prohibited.'],
      }),
    );
  } else if (loadTxAggregates && aggregates && !aggregates.ok && !loadTxRows) {
    domainStatuses.push(
      domain('transactions', 'unavailable', {
        errorCode: aggregates.errorCode ?? 'AGGREGATE_FAILED',
        notes: ['Transaction aggregates unavailable.'],
      }),
    );
  } else if (loadTxAggregates && aggregates?.ok && !loadTxRows) {
    domainStatuses.push(
      domain('transactions', 'available', {
        recordsProcessed: aggregates.txCount,
        asOf: aggregates.asOf,
        notes: ['Transaction totals from server aggregate (full entitled summary).'],
      }),
    );
  }

  if (positionsResult.error) {
    console.error('[AI Context] Failed to load asset positions:', positionsResult.error);
    domainStatuses.push(
      domain('holdings', 'unavailable', {
        errorCode: 'HOLDINGS_LOAD_FAILED',
        notes: ['Asset positions retrieval failed.'],
      }),
    );
  } else if (!dataRequirements.holdings) {
    domainStatuses.push(domain('holdings', 'not_required', { notes: [] }));
  }

  const rows = (transactionsResult.data ?? []) as unknown as TransactionRow[];
  const positions = (positionsResult.data ?? []) as unknown as AssetPositionRow[];
  const clients = mapClients((clientsResult.data ?? []) as unknown as ClientRow[]);

  const assets = positions.map(toAssetHolding).filter(asset => asset.symbol.length > 0);
  const transactions = rows.map(row => toTransaction(row, clients));
  const visibleTransactions = filterVisibleTransactions(transactions, includeHidden);

  if (!positionsResult.error && dataRequirements.holdings) {
    domainStatuses.push(
      domain('holdings', assets.length > 0 ? 'available' : 'available', {
        recordsProcessed: assets.length,
        notes:
          assets.length === 0
            ? ['No priced holdings stored (empty successful query).']
            : [],
      }),
    );
  }

  const portfolioValueUsd = assets
    .filter(asset => includeHidden || asset.isSpam !== true)
    .reduce((total, asset) => total + (Number.isFinite(asset.valueUsd) ? asset.valueUsd : 0), 0);

  const pricedAssets = assets.filter(a => (a.valueUsd ?? 0) > 0 && (a.priceUsd ?? 0) > 0);
  domainStatuses.push(
    domain(
      'pricing',
      !dataRequirements.pricing
        ? 'not_required'
        : assets.length === 0
          ? 'available'
          : pricedAssets.length === assets.length
            ? 'available'
            : pricedAssets.length > 0
              ? 'partial'
              : 'unavailable',
      {
        completeness: assets.length > 0 ? pricedAssets.length / assets.length : 1,
        notes:
          pricedAssets.length < assets.length && assets.length > 0
            ? ['Some holdings lack USD prices; USD totals may be partial.']
            : [],
      },
    ),
  );

  if (!scope.snapshots) {
    domainStatuses.push(domain('snapshots', 'not_required', { notes: [] }));
  } else {
    domainStatuses.push(
      domain('snapshots', snapshots.length > 0 ? 'available' : 'unavailable', {
        recordsProcessed: snapshots.length,
        notes:
          snapshots.length === 0
            ? ['No daily portfolio snapshots are stored (empty or missing).']
            : [],
      }),
    );
  }

  domainStatuses.push(
    domain(
      'investment_return',
      !scope.investmentReturn
        ? 'not_required'
        : investmentReturn
          ? 'available'
          : 'unavailable',
      {
        notes: !scope.investmentReturn
          ? []
          : investmentReturn
            ? []
            : ['Investment-return lots unavailable; do not infer cost basis from portfolio change.'],
      },
    ),
  );

  domainStatuses.push(
    domain(
      'trading_volume',
      !scope.tradingVolume ? 'not_required' : 'available',
      { notes: [] },
    ),
  );

  domainStatuses.push(
    domain('counterparties', scope.clients ? 'available' : 'not_required', {
      recordsProcessed: clients.length,
      notes: [],
    }),
  );

  let financialSummary = computeFinancialSummary(rows, { ethPriceUsd });
  if ((txPlan.mode === 'aggregate' || txPlan.mode === 'none') && aggregates?.ok) {
    financialSummary = {
      ...financialSummary,
      totalRevenue: aggregates.inflowUsd,
      totalExpenses: aggregates.outflowUsd,
      netFlow: aggregates.netFlowUsd,
      gasFees: aggregates.gasFeesUsd,
      tradingVolume: aggregates.tradingVolumeUsd,
      transactionCount: aggregates.txCount,
      methodology:
        financialSummary.methodology ||
        'Server aggregate from wallet_financial_summary (exact entitled totals).',
    };
  }

  const tradingVolume = scope.tradingVolume && rows.length > 0 ? computeTradingVolumeDetail(rows) : null;

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

  let totalTransactionCount: number | null =
    typeof transactionsResult.count === 'number' ? transactionsResult.count : null;

  if (txPlan.mode === 'aggregate' && aggregates?.ok) {
    totalTransactionCount = aggregates.txCount;
  } else if (txPlan.mode === 'none') {
    totalTransactionCount = aggregates?.ok ? aggregates.txCount : null;
  } else if (txPlan.mode === 'filtered' && totalTransactionCount == null) {
    const counted = await countMatchingTransactions(supabase, wallet.id, {
      asset: txPlan.asset,
      network: txPlan.network,
      counterparty: txPlan.counterparty,
      fromIso: txPlan.from,
      toIso: txPlan.to,
    });
    if (counted.ok) totalTransactionCount = counted.matchingCount;
  }

  const coverageFlags = coverageFromLoad({
    loaded: transactions.length,
    matchingTotal:
      txPlan.mode === 'aggregate' && aggregates?.ok
        ? aggregates.txCount
        : totalTransactionCount,
    mode: txPlan.mode,
  });

  // Mark partial when row load hit budget
  if (
    loadTxRows &&
    !transactionsResult.error &&
    !domainStatuses.some(d => d.domain === 'transactions')
  ) {
    domainStatuses.push(
      domain('transactions', coverageFlags.truncated ? 'partial' : 'available', {
        recordsProcessed: transactions.length,
        notes: coverageFlags.truncationReason ? [coverageFlags.truncationReason] : [],
      }),
    );
  }

  const walletProfile = toWalletProfile(wallet, transactions, assets, now);

  const notes = buildCoverageNotes({
    truncated: coverageFlags.truncated,
    loaded: transactions.length,
    total: totalTransactionCount,
    snapshotCount: snapshots.length,
    holdingCount: assets.length,
    syncStatus: walletProfile.syncStatus,
    includeHidden,
    hiddenCount: transactions.length - visibleTransactions.length,
    investmentReturnLoaded: investmentReturn !== null,
  });

  if (txPlan.mode === 'none') {
    notes.unshift('Transactions were not loaded; analysis uses holdings/aggregates only as required.');
  }
  if (txPlan.mode === 'aggregate' && aggregates?.ok) {
    notes.unshift(
      `Full entitled transaction totals from server aggregate (${aggregates.txCount.toLocaleString('en-US')} txs); raw history not loaded into memory.`,
    );
  }
  if (coverageFlags.truncated) {
    notes.unshift(
      coverageFlags.truncationReason ??
        'Transaction coverage is partial; results must not claim complete entitled history.',
    );
  }

  const coverage: WalletContextCoverage = {
    loadedTransactionCount: transactions.length,
    totalTransactionCount,
    visibleTransactionCount: visibleTransactions.length,
    transactionCap: rowBudget,
    truncated: coverageFlags.truncated,
    isFullEntitledHistory: coverageFlags.isFullEntitledHistory,
    truncationReason: coverageFlags.truncationReason,
    hasSnapshots: snapshots.length > 0,
    hasHoldings: assets.length > 0,
    notes,
    transactionLoadMode: txPlan.mode,
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
    domainStatuses,
    transactionAggregates: aggregates,
    dataRequirements,
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
    gasFeeEth: row.gas_fee_eth ?? undefined,
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
      `Partial coverage: processed ${input.loaded.toLocaleString('en-US')} of ${total} matching transactions; this is not complete entitled history`,
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

// ---------------------------------------------------------------------------
// Screen grounding (Analyze button)
// ---------------------------------------------------------------------------

/**
 * Merge screen rows into the DB wallet context (legacy entry point).
 *
 * Package 1: server holdings totals remain authoritative. Client portfolio
 * values are accepted only when within tolerance of the server total.
 * Prefer `applyTrustedScreenSnapshot` from `@/lib/ai/trust` in new code.
 */
export function applyScreenSnapshot(
  context: WalletContext,
  snapshot: AiScreenSnapshot | null | undefined,
): WalletContext {
  if (!snapshot) return context;

  const notes = [...context.coverage.notes];
  let assets = context.assets;
  let transactions = context.transactions;
  let clients = context.clients;
  let snapshots = context.snapshots;
  let portfolioValueUsd = context.portfolioValueUsd;
  let investmentReturn = context.investmentReturn;
  let tradingVolume = context.tradingVolume;
  let applied = false;
  let screenScopedTx = false;

  if (Array.isArray(snapshot.assets)) {
    const screenAssets = snapshot.assets.map(fromScreenAsset);
    // Package 1: never replace holdings with a screen subset for authority —
    // always merge so allocation cannot collapse to 100% of one token.
    const mode = snapshot.assetsMode ?? 'merge';
    assets =
      mode === 'replace'
        ? mergeAssetHoldings(context.assets, screenAssets)
        : mergeAssetHoldings(context.assets, screenAssets);
    applied = true;
    notes.unshift(
      `Holdings merge ${screenAssets.length.toLocaleString('en-US')} on-screen row(s) into server positions (server values authoritative)`,
    );
  }

  if (Array.isArray(snapshot.transactions)) {
    const screenTxs = snapshot.transactions.map(row => fromScreenTransaction(row, clients));
    const mode = snapshot.transactionsMode ?? 'merge';
    if (mode === 'replace') {
      // Keep server txs for calculations; mark scope as screen-filtered.
      screenScopedTx = true;
      notes.unshift(
        `Screen shows ${screenTxs.length.toLocaleString('en-US')} transaction row(s); findings scoped to visible subset — not full entitled history`,
      );
    } else {
      transactions = mergeTransactions(context.transactions, screenTxs);
      notes.unshift(
        `Activity merges ${screenTxs.length.toLocaleString('en-US')} on-screen transaction(s) into the wallet history`,
      );
    }
    applied = true;
  }

  if (Array.isArray(snapshot.clients)) {
    clients = mergeClients(context.clients, snapshot.clients.map(fromScreenClient));
    applied = true;
    notes.unshift(
      `Counterparties merge ${snapshot.clients.length.toLocaleString('en-US')} on-screen client(s) into the wallet directory`,
    );
  }

  if (Array.isArray(snapshot.snapshots) && snapshot.snapshots.length > 0) {
    // Prefer server snapshots when present; screen may enrich only if empty.
    if (context.snapshots.length === 0) {
      snapshots = snapshot.snapshots.map(point => ({ date: point.date, value: point.value }));
      applied = true;
    }
  }

  // Server portfolio is authoritative. Accept client only within 2% / $1.
  if (
    typeof snapshot.portfolioValueUsd === 'number' &&
    Number.isFinite(snapshot.portfolioValueUsd) &&
    snapshot.portfolioValueUsd >= 0
  ) {
    const client = snapshot.portfolioValueUsd;
    const server = context.portfolioValueUsd;
    const abs = Math.abs(client - server);
    const rel = server > 0 ? abs / server : abs > 0 ? 1 : 0;
    if (abs > 1 && rel > 0.02) {
      notes.unshift(
        `Client portfolio $${client.toFixed(2)} rejected; server holdings total $${server.toFixed(2)} is authoritative`,
      );
      portfolioValueUsd = server;
    } else {
      portfolioValueUsd = server > 0 ? server : client;
      notes.unshift('Client portfolio matched server within tolerance; server value used.');
    }
    applied = true;
  } else {
    const mergedTotal = sumAssetValue(assets, context.includeHidden);
    portfolioValueUsd = Math.max(context.portfolioValueUsd, mergedTotal);
  }

  // Do not accept client investment-return / trading-volume as authority.
  if (snapshot.investmentReturn != null) {
    notes.unshift('Client investment-return payload ignored; server lots remain authoritative.');
    applied = true;
  }

  if (snapshot.tradingVolume != null) {
    notes.unshift('Client trading-volume payload ignored; server aggregates remain authoritative.');
    applied = true;
  }

  if (!applied) return context;

  const visibleTransactions = filterVisibleTransactions(transactions, context.includeHidden);
  const financialSummary = computeFinancialSummary(transactions, {
    ethPriceUsd: context.ethPriceUsd,
  });

  const coverage: WalletContextCoverage = {
    ...context.coverage,
    loadedTransactionCount: transactions.length,
    visibleTransactionCount: visibleTransactions.length,
    truncated: context.coverage.truncated || screenScopedTx,
    isFullEntitledHistory: false,
    truncationReason: screenScopedTx
      ? 'Screen-filtered transaction scope'
      : context.coverage.truncationReason,
    hasSnapshots: snapshots.length > 0,
    hasHoldings: assets.length > 0,
    notes: dedupeNotes(notes),
  };

  const intelligenceInput: IntelligenceInput = {
    ...context.intelligenceInput,
    transactions,
    assets,
    clients,
    portfolioValueUsd: portfolioValueUsd > 0 ? portfolioValueUsd : undefined,
    snapshots,
    investmentReturn: investmentReturn ?? undefined,
    tradingVolume: tradingVolume ?? undefined,
    includeHidden: context.includeHidden,
    dataGrounding: 'screen',
  };

  return {
    ...context,
    transactions,
    visibleTransactions,
    assets,
    clients,
    snapshots,
    portfolioValueUsd,
    financialSummary,
    investmentReturn,
    tradingVolume,
    coverage,
    intelligenceInput,
    domainStatuses: context.domainStatuses ?? [],
  };
}

function sumAssetValue(assets: AssetHolding[], includeHidden: boolean): number {
  return assets
    .filter(asset => includeHidden || asset.isSpam !== true)
    .reduce((total, asset) => total + (Number.isFinite(asset.valueUsd) ? asset.valueUsd : 0), 0);
}

function assetKey(asset: AssetHolding): string {
  const symbol = (asset.symbol || '').toUpperCase();
  const network = (asset.network || '').toLowerCase();
  const address = (asset.tokenAddress || '').toLowerCase();
  return `${symbol}|${network}|${address}`;
}

function mergeAssetHoldings(dbAssets: AssetHolding[], screenAssets: AssetHolding[]): AssetHolding[] {
  const map = new Map<string, AssetHolding>();
  for (const asset of dbAssets) map.set(assetKey(asset), asset);

  for (const screen of screenAssets) {
    const key = assetKey(screen);
    const prev = map.get(key);
    if (!prev) {
      const symbolOnly = [...map.entries()].find(
        ([, v]) =>
          v.symbol.toUpperCase() === screen.symbol.toUpperCase() &&
          (!screen.network ||
            !v.network ||
            v.network.toLowerCase() === (screen.network || '').toLowerCase()),
      );
      if (symbolOnly && (!screen.tokenAddress || !symbolOnly[1].tokenAddress)) {
        map.set(symbolOnly[0], overlayHolding(symbolOnly[1], screen));
        continue;
      }
      map.set(key, screen);
      continue;
    }
    map.set(key, overlayHolding(prev, screen));
  }

  return [...map.values()].sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
}

function overlayHolding(base: AssetHolding, screen: AssetHolding): AssetHolding {
  const quantity = screen.quantity ?? base.quantity;
  let priceUsd = screen.priceUsd ?? base.priceUsd;
  const valueUsd = screen.valueUsd > 0 ? screen.valueUsd : base.valueUsd > 0 ? base.valueUsd : 0;
  if (
    (priceUsd == null || priceUsd <= 0) &&
    typeof quantity === 'number' &&
    quantity > 0 &&
    valueUsd > 0
  ) {
    priceUsd = valueUsd / quantity;
  }
  return {
    ...base,
    name: screen.name || base.name,
    quantity,
    priceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : base.priceUsd,
    valueUsd,
    network: screen.network || base.network,
    tokenAddress: screen.tokenAddress || base.tokenAddress,
    isSpam: screen.isSpam ?? base.isSpam,
  };
}

function mergeTransactions(
  dbTxs: IntelligenceTransaction[],
  screenTxs: IntelligenceTransaction[],
): IntelligenceTransaction[] {
  const map = new Map<string, IntelligenceTransaction>();
  const keyOf = (tx: IntelligenceTransaction) =>
    (tx.txHash || tx.id || `${tx.timestamp}:${tx.token}:${tx.value}`).toLowerCase();

  for (const tx of dbTxs) map.set(keyOf(tx), tx);
  for (const tx of screenTxs) map.set(keyOf(tx), { ...map.get(keyOf(tx)), ...tx });

  return [...map.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function mergeClients(dbClients: Client[], screenClients: Client[]): Client[] {
  const map = new Map<string, Client>();
  for (const client of dbClients) map.set(client.address.toLowerCase(), client);
  for (const client of screenClients) {
    const key = client.address.toLowerCase();
    map.set(key, { ...map.get(key), ...client, address: client.address, name: client.name });
  }
  return [...map.values()];
}

function fromScreenAsset(row: AiScreenAsset): AssetHolding {
  const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : null;
  let priceUsd =
    typeof row.priceUsd === 'number' && Number.isFinite(row.priceUsd) && row.priceUsd > 0
      ? row.priceUsd
      : null;
  const valueUsd = Number.isFinite(row.valueUsd) ? row.valueUsd : 0;
  if (priceUsd == null && quantity != null && quantity > 0 && valueUsd > 0) {
    priceUsd = valueUsd / quantity;
  }
  return {
    symbol: row.symbol,
    name: row.name ?? null,
    quantity,
    priceUsd,
    valueUsd,
    network: row.network ?? null,
    tokenAddress: row.tokenAddress ?? null,
    isSpam: row.isSpam ?? null,
  };
}

function fromScreenTransaction(
  row: AiScreenTransaction,
  clients: ClientNameRef[],
): IntelligenceTransaction {
  const type = (row.type || 'income') as Transaction['type'];
  const network = row.network || 'ethereum';
  const valueUsd = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : 0;
  const quantity = typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : 0;
  const price =
    typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
      ? row.price
      : quantity > 0 && valueUsd > 0
        ? valueUsd / quantity
        : 0;

  const counterparty = row.counterparty || '';
  const counterpartyLabel = resolveCounterpartyDisplay(
    { counterparty, counterpartyLabel: row.counterpartyLabel || '' },
    clients,
  );

  return {
    id: row.id || row.txHash || '',
    date: row.date || '',
    timestamp: typeof row.timestamp === 'number' ? row.timestamp : 0,
    type,
    typeLabel: row.typeLabel || TYPE_LABELS[type] || resolveTypeLabel(type) || type,
    activity: row.activity || '',
    methodName: row.methodName,
    direction: row.direction,
    token: row.token || 'ETH',
    quantity,
    price,
    value: valueUsd,
    network,
    networkLabel: row.networkLabel || NETWORK_LABELS[network] || capitalize(network),
    txHash: row.txHash || '',
    counterparty,
    counterpartyLabel,
    gasFeeEth: row.gasFeeEth,
    gasFeeUsd: row.gasFeeUsd,
    valueUsd,
    tokenSymbol: row.token || null,
    priceUsd: price > 0 ? price : null,
  };
}

function fromScreenClient(row: AiScreenClient): Client {
  return {
    id: row.id || row.address,
    name: row.name,
    address: row.address,
    notes: row.notes || '',
    color: row.color || '',
    createdAt: row.createdAt || '',
  };
}

function dedupeNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    if (!note || seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}
