/**
 * On-screen data the AI Data Analysis button sends with each request.
 *
 * Chat never uses this — it loads from the database based on the user's question.
 * Analyze uses it as the primary ground truth for what the user currently sees.
 */

/** Cap payload size so a busy page cannot blow the analyze request body. */
export const SCREEN_SNAPSHOT_LIMITS = {
  assets: 500,
  transactions: 2000,
  clients: 500,
  snapshots: 730,
} as const;

export interface AiScreenAsset {
  symbol: string;
  name?: string | null;
  quantity?: number | null;
  priceUsd?: number | null;
  valueUsd: number;
  network?: string | null;
  tokenAddress?: string | null;
  isSpam?: boolean | null;
}

/** Lean transaction shape matching the dashboard table rows. */
export interface AiScreenTransaction {
  id?: string;
  date?: string;
  timestamp?: number;
  type?: string;
  typeLabel?: string;
  activity?: string;
  methodName?: string | null;
  direction?: string | null;
  token?: string;
  quantity?: number;
  price?: number;
  value?: number;
  network?: string;
  networkLabel?: string;
  txHash?: string;
  counterparty?: string;
  counterpartyLabel?: string;
  gasFeeEth?: number;
  gasFeeUsd?: number;
}

export interface AiScreenClient {
  id?: string;
  name: string;
  address: string;
  notes?: string;
  color?: string;
  createdAt?: string;
}

export interface AiScreenSnapshotPoint {
  date: string;
  value: number;
}

/**
 * Whatever the page is currently rendering.
 *
 * By default screen rows **merge into** the database wallet context (enrich /
 * overlay). Use `replace` only when the page intentionally scopes the whole
 * analysis to the visible subset (e.g. filtered transaction activity).
 */
export interface AiScreenSnapshot {
  assets?: AiScreenAsset[];
  transactions?: AiScreenTransaction[];
  clients?: AiScreenClient[];
  portfolioValueUsd?: number | null;
  snapshots?: AiScreenSnapshotPoint[];
  /** Page-level Investment Return / Trading Volume payloads already shown. */
  investmentReturn?: unknown;
  tradingVolume?: unknown;
  /**
   * `merge` (default): overlay screen holdings onto DB holdings — keeps the
   * rest of the portfolio so allocation % stays correct.
   * `replace`: analyze only the holdings listed on screen (Assets tab).
   */
  assetsMode?: 'merge' | 'replace';
  /**
   * `merge` (default): overlay screen txs onto DB history.
   * `replace`: activity limited to the rows shown (asset/network detail tables).
   */
  transactionsMode?: 'merge' | 'replace';
  /** Presentation metadata (Package 1) — not a financial source of truth. */
  page?: string;
  sectionType?: string;
  period?: string | number | null;
  filters?: Record<string, string | number | boolean | null>;
  sorting?: Record<string, unknown>;
  visibleRowIds?: string[];
  clientAsOf?: string | null;
}

type LooseRecord = Record<string, unknown>;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapScreenAsset(raw: unknown): AiScreenAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as LooseRecord;
  const symbol =
    asString(row.symbol) ||
    asString(row.token) ||
    asString(row.tokenSymbol) ||
    asString(row.token_symbol);
  if (!symbol) return null;

  const quantity =
    asFiniteNumber(row.quantity) ??
    asFiniteNumber(row.balance) ??
    null;
  const valueUsd =
    asFiniteNumber(row.valueUsd) ??
    asFiniteNumber(row.value_usd) ??
    asFiniteNumber(row.value) ??
    0;
  let priceUsd =
    asFiniteNumber(row.priceUsd) ??
    asFiniteNumber(row.price_usd) ??
    asFiniteNumber(row.price);

  if ((priceUsd == null || priceUsd <= 0) && quantity != null && quantity > 0 && valueUsd > 0) {
    priceUsd = valueUsd / quantity;
  }

  return {
    symbol,
    name: asString(row.name) ?? asString(row.token_name) ?? asString(row.tokenName),
    quantity,
    priceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : null,
    valueUsd,
    network:
      asString(row.network) ||
      asString(row.chain) ||
      null,
    tokenAddress:
      asString(row.tokenAddress) ||
      asString(row.token_address) ||
      asString(row.address) ||
      null,
    isSpam: typeof row.isSpam === 'boolean' ? row.isSpam : typeof row.is_spam === 'boolean' ? row.is_spam : null,
  };
}

function mapScreenTransaction(raw: unknown): AiScreenTransaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as LooseRecord;
  const token = asString(row.token) || asString(row.tokenSymbol) || asString(row.token_symbol) || 'UNKNOWN';
  return {
    id: asString(row.id) ?? undefined,
    date: asString(row.date) ?? undefined,
    timestamp: asFiniteNumber(row.timestamp) ?? undefined,
    type: asString(row.type) ?? undefined,
    typeLabel: asString(row.typeLabel) ?? asString(row.type_label) ?? undefined,
    activity: asString(row.activity) ?? undefined,
    methodName: asString(row.methodName) ?? asString(row.method_name),
    direction: asString(row.direction),
    token,
    quantity: asFiniteNumber(row.quantity) ?? asFiniteNumber(row.tokenValue) ?? undefined,
    price: asFiniteNumber(row.price) ?? asFiniteNumber(row.priceUsd) ?? undefined,
    value: asFiniteNumber(row.value) ?? asFiniteNumber(row.valueUsd) ?? undefined,
    network: asString(row.network) ?? undefined,
    networkLabel: asString(row.networkLabel) ?? asString(row.network_label) ?? undefined,
    txHash: asString(row.txHash) ?? asString(row.tx_hash) ?? asString(row.hash) ?? undefined,
    counterparty: asString(row.counterparty) ?? undefined,
    counterpartyLabel: asString(row.counterpartyLabel) ?? asString(row.counterparty_label) ?? undefined,
    gasFeeEth: asFiniteNumber(row.gasFeeEth) ?? asFiniteNumber(row.gas_fee_eth) ?? undefined,
    gasFeeUsd: asFiniteNumber(row.gasFeeUsd) ?? asFiniteNumber(row.gas_fee_usd) ?? undefined,
  };
}

function mapScreenClient(raw: unknown): AiScreenClient | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as LooseRecord;
  const address = asString(row.address);
  const name = asString(row.name);
  if (!address || !name) return null;
  return {
    id: asString(row.id) ?? undefined,
    name,
    address,
    notes: asString(row.notes) ?? undefined,
    color: asString(row.color) ?? undefined,
    createdAt: asString(row.createdAt) ?? asString(row.created_at) ?? undefined,
  };
}

function mapSnapshotPoint(raw: unknown): AiScreenSnapshotPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as LooseRecord;
  const date = asString(row.date);
  const value = asFiniteNumber(row.value);
  if (!date || value == null) return null;
  return { date, value };
}

function takeMapped<T>(
  items: unknown[] | undefined,
  limit: number,
  map: (raw: unknown) => T | null,
): T[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const out: T[] = [];
  for (const item of items) {
    if (out.length >= limit) break;
    const mapped = map(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Normalize loose page props into a transport-safe snapshot. */
export function buildScreenSnapshot(input: {
  assets?: unknown[];
  transactions?: unknown[];
  clients?: unknown[];
  portfolioValueUsd?: number | null;
  snapshots?: unknown[];
  investmentReturn?: unknown;
  tradingVolume?: unknown;
  assetsMode?: 'merge' | 'replace';
  transactionsMode?: 'merge' | 'replace';
}): AiScreenSnapshot | undefined {
  const assets = takeMapped(input.assets, SCREEN_SNAPSHOT_LIMITS.assets, mapScreenAsset);
  const transactions = takeMapped(
    input.transactions,
    SCREEN_SNAPSHOT_LIMITS.transactions,
    mapScreenTransaction,
  );
  const clients = takeMapped(input.clients, SCREEN_SNAPSHOT_LIMITS.clients, mapScreenClient);
  const snapshots = takeMapped(
    input.snapshots,
    SCREEN_SNAPSHOT_LIMITS.snapshots,
    mapSnapshotPoint,
  );

  const portfolioValueUsd =
    typeof input.portfolioValueUsd === 'number' && Number.isFinite(input.portfolioValueUsd)
      ? input.portfolioValueUsd
      : null;

  const snapshot: AiScreenSnapshot = {};
  if (assets) snapshot.assets = assets;
  if (transactions) snapshot.transactions = transactions;
  if (clients) snapshot.clients = clients;
  if (snapshots) snapshot.snapshots = snapshots;
  if (portfolioValueUsd != null && portfolioValueUsd > 0) snapshot.portfolioValueUsd = portfolioValueUsd;
  if (input.investmentReturn != null) snapshot.investmentReturn = input.investmentReturn;
  if (input.tradingVolume != null) snapshot.tradingVolume = input.tradingVolume;
  if (input.assetsMode === 'merge' || input.assetsMode === 'replace') {
    snapshot.assetsMode = input.assetsMode;
  }
  if (input.transactionsMode === 'merge' || input.transactionsMode === 'replace') {
    snapshot.transactionsMode = input.transactionsMode;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

/** Server-side parse of an untrusted request body field. */
export function parseScreenSnapshot(raw: unknown): AiScreenSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as LooseRecord;
  const assetsMode = body.assetsMode === 'replace' || body.assetsMode === 'merge' ? body.assetsMode : undefined;
  const transactionsMode =
    body.transactionsMode === 'replace' || body.transactionsMode === 'merge'
      ? body.transactionsMode
      : undefined;
  return (
    buildScreenSnapshot({
      assets: Array.isArray(body.assets) ? body.assets : undefined,
      transactions: Array.isArray(body.transactions) ? body.transactions : undefined,
      clients: Array.isArray(body.clients) ? body.clients : undefined,
      portfolioValueUsd: asFiniteNumber(body.portfolioValueUsd),
      snapshots: Array.isArray(body.snapshots) ? body.snapshots : undefined,
      investmentReturn: body.investmentReturn,
      tradingVolume: body.tradingVolume,
      assetsMode,
      transactionsMode,
    }) ?? null
  );
}
