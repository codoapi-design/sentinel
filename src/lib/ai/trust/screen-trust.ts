/**
 * Screen snapshot trust model — presentation context vs client-displayed values.
 * Server financial data remains authoritative.
 */

import type { AiScreenSnapshot } from '@/lib/ai-screen-snapshot';
import type { WalletContext } from '@/lib/ai/tools/context';

import type { GroundingReport } from './types';

const PORTFOLIO_REL_TOLERANCE = 0.02; // 2%
const PORTFOLIO_ABS_TOLERANCE = 1; // $1

export interface ScreenPresentationContext {
  page: string;
  sectionType: string;
  selectedEntity?: {
    type: 'asset' | 'network' | 'counterparty' | 'transaction';
    id?: string;
    symbol?: string;
    name?: string;
  };
  period?: string;
  filters: Record<string, unknown>;
  sorting?: Record<string, unknown>;
  visibleRowIds?: string[];
  clientAsOf?: string;
}

export interface ClientDisplayedValues {
  portfolioValueUsd?: number;
  assets?: unknown[];
  transactions?: unknown[];
}

export function splitScreenSnapshot(snapshot: AiScreenSnapshot | null | undefined): {
  presentation: ScreenPresentationContext | null;
  clientValues: ClientDisplayedValues;
} {
  if (!snapshot) return { presentation: null, clientValues: {} };

  const page = typeof snapshot.page === 'string' ? snapshot.page : '';
  const sectionType = typeof snapshot.sectionType === 'string' ? snapshot.sectionType : '';

  let selectedEntity: ScreenPresentationContext['selectedEntity'];
  // Heuristic from filters / first asset
  if (Array.isArray(snapshot.assets) && snapshot.assets.length === 1) {
    const a = snapshot.assets[0] as { symbol?: string; name?: string };
    selectedEntity = {
      type: 'asset',
      symbol: a.symbol,
      name: a.name ?? undefined,
    };
  }

  const presentation: ScreenPresentationContext = {
    page,
    sectionType,
    selectedEntity,
    period: snapshot.period != null ? String(snapshot.period) : undefined,
    filters: (snapshot.filters as Record<string, unknown>) ?? {},
    sorting: snapshot.sorting as Record<string, unknown> | undefined,
    visibleRowIds: snapshot.visibleRowIds,
    clientAsOf: snapshot.clientAsOf ?? undefined,
  };

  const clientValues: ClientDisplayedValues = {
    portfolioValueUsd:
      typeof snapshot.portfolioValueUsd === 'number' && Number.isFinite(snapshot.portfolioValueUsd)
        ? snapshot.portfolioValueUsd
        : undefined,
    assets: snapshot.assets,
    transactions: snapshot.transactions,
  };

  return { presentation, clientValues };
}

export function verifyScreenAgainstServer(
  context: WalletContext,
  clientValues: ClientDisplayedValues,
  presentation: ScreenPresentationContext | null,
): GroundingReport {
  const discrepancies: GroundingReport['discrepancies'] = [];
  let verified = true;

  const serverPortfolio = context.portfolioValueUsd;
  const clientPortfolio = clientValues.portfolioValueUsd;

  if (clientPortfolio != null && Number.isFinite(clientPortfolio)) {
    const abs = Math.abs(clientPortfolio - serverPortfolio);
    const rel = serverPortfolio > 0 ? abs / serverPortfolio : abs > 0 ? 1 : 0;
    if (abs > PORTFOLIO_ABS_TOLERANCE && rel > PORTFOLIO_REL_TOLERANCE) {
      verified = false;
      discrepancies.push({
        field: 'portfolioValueUsd',
        clientValue: clientPortfolio,
        serverValue: serverPortfolio,
        severity: 'error',
        note: 'Client-reported portfolio value disagrees with server holdings total; server value is authoritative.',
      });
    }
  }

  if (Array.isArray(clientValues.assets) && clientValues.assets.length > 0) {
    const serverBySymbol = new Map(
      context.assets.map(a => [a.symbol.toUpperCase(), a.valueUsd] as const),
    );
    for (const raw of clientValues.assets) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as { symbol?: string; valueUsd?: number };
      const sym = (row.symbol ?? '').toUpperCase();
      if (!sym || typeof row.valueUsd !== 'number' || !Number.isFinite(row.valueUsd)) continue;
      const serverVal = serverBySymbol.get(sym);
      if (serverVal == null) continue;
      const abs = Math.abs(row.valueUsd - serverVal);
      const rel = serverVal > 0 ? abs / serverVal : abs > 0 ? 1 : 0;
      if (abs > PORTFOLIO_ABS_TOLERANCE && rel > 0.05) {
        verified = false;
        discrepancies.push({
          field: `asset.${sym}.valueUsd`,
          clientValue: row.valueUsd,
          serverValue: serverVal,
          severity: 'warning',
          note: `Client asset value for ${sym} disagrees with server position; server value preferred.`,
        });
      }
    }
  }

  const screenFiltered =
    presentation != null &&
    (Boolean(presentation.visibleRowIds?.length) ||
      Object.keys(presentation.filters).length > 0);

  if (screenFiltered) {
    discrepancies.push({
      field: 'scope',
      clientValue: 'filtered_visible_subset',
      serverValue: 'server_database',
      severity: 'info',
      note: 'Screen filters describe a visible subset; findings must not be labeled as full entitled history.',
    });
  }

  return {
    primarySource: discrepancies.some(d => d.severity === 'error')
      ? 'hybrid_unverified'
      : clientValues.portfolioValueUsd != null || clientValues.assets
        ? 'hybrid_verified'
        : 'server_database',
    screenContextUsed: presentation != null,
    screenValuesVerified: verified && discrepancies.every(d => d.severity !== 'error'),
    discrepancies,
  };
}

/**
 * Apply screen presentation for planning hints only.
 * Never overrides server portfolio/asset totals with unverified client numbers.
 * Enrichment (merge of missing symbols) is allowed; replace of portfolio total is not.
 */
export function applyTrustedScreenSnapshot(
  context: WalletContext,
  snapshot: AiScreenSnapshot | null | undefined,
): { context: WalletContext; grounding: GroundingReport } {
  const { presentation, clientValues } = splitScreenSnapshot(snapshot);
  if (!snapshot) {
    return {
      context,
      grounding: {
        primarySource: 'server_database',
        screenContextUsed: false,
        screenValuesVerified: true,
        discrepancies: [],
      },
    };
  }

  const grounding = verifyScreenAgainstServer(context, clientValues, presentation);
  const notes = [...context.coverage.notes];

  // Keep server portfolio authoritative when discrepancy is material.
  let portfolioValueUsd = context.portfolioValueUsd;
  const rejectClientPortfolio = grounding.discrepancies.some(
    d => d.field === 'portfolioValueUsd' && d.severity === 'error',
  );

  if (
    !rejectClientPortfolio &&
    typeof snapshot.portfolioValueUsd === 'number' &&
    Number.isFinite(snapshot.portfolioValueUsd) &&
    snapshot.portfolioValueUsd >= 0 &&
    // Only accept client portfolio when it matches server within tolerance (already verified)
    grounding.screenValuesVerified
  ) {
    // Prefer server always for calculations; optionally note parity.
    portfolioValueUsd = context.portfolioValueUsd;
    notes.unshift('Client portfolio value matched server within tolerance; server value used for calculations.');
  } else if (rejectClientPortfolio) {
    notes.unshift(
      'Client-reported portfolio value rejected; server holdings total is authoritative for this analysis.',
    );
  }

  // Merge screen assets as enrichment only (never collapse portfolio via replace for values).
  let assets = context.assets;
  if (Array.isArray(snapshot.assets) && snapshot.assets.length > 0) {
    // Reuse merge path from context module via dynamic import avoidance — inline light merge.
    const byKey = new Map(assets.map(a => [`${a.symbol.toUpperCase()}|${a.network ?? ''}`, a]));
    for (const raw of snapshot.assets) {
      const row = raw as {
        symbol?: string;
        name?: string | null;
        valueUsd?: number | null;
        quantity?: number | null;
        priceUsd?: number | null;
        network?: string | null;
        tokenAddress?: string | null;
        isSpam?: boolean | null;
      };
      const symbol = (row.symbol ?? '').trim();
      if (!symbol) continue;
      const key = `${symbol.toUpperCase()}|${row.network ?? ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        // Do not invent new holdings from screen alone for authoritative totals.
        notes.push(`On-screen asset ${symbol} not present in server positions; ignored for financial totals.`);
        continue;
      }
      // Enrich metadata only when server already has the position.
      byKey.set(key, {
        ...existing,
        name: existing.name || row.name || existing.name,
      });
    }
    assets = [...byKey.values()];
    notes.unshift('Screen assets used for presentation enrichment only; server position values remain authoritative.');
  }

  // Transactions: allow scoped replace for visible subset, but mark coverage partial / not full history.
  let transactions = context.transactions;
  let visibleTransactions = context.visibleTransactions;
  let truncated = context.coverage.truncated;
  let isScreenScoped = false;

  if (Array.isArray(snapshot.transactions) && snapshot.transactionsMode === 'replace') {
    isScreenScoped = true;
    truncated = true;
    notes.unshift(
      `Transaction findings are scoped to ${snapshot.transactions.length} on-screen row(s); not full entitled history.`,
    );
    // Keep DB transactions for server truth; engines that need screen scope should use a flag.
    // We do NOT replace DB txs with client rows for financial calculation.
  }

  for (const d of grounding.discrepancies) {
    if (d.severity !== 'info') {
      notes.push(d.note);
    }
  }

  const next: WalletContext = {
    ...context,
    assets,
    portfolioValueUsd,
    transactions,
    visibleTransactions,
    coverage: {
      ...context.coverage,
      truncated: truncated || context.coverage.truncated,
      notes,
    },
    intelligenceInput: {
      ...context.intelligenceInput,
      assets,
      portfolioValueUsd: portfolioValueUsd > 0 ? portfolioValueUsd : undefined,
      transactions,
    },
  };

  // Attach grounding marker via notes for downstream scope builders
  if (isScreenScoped) {
    next.coverage.notes = [
      ...next.coverage.notes,
      'Screen-filtered analysis: isFullEntitledHistory must remain false.',
    ];
  }

  return { context: next, grounding };
}
