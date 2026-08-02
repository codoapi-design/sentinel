/**
 * AnalysisScope builders and coverage helpers.
 */

import type { AnalysisDataSource, AnalysisScope, CoverageStatus, DataRequirementsPlan } from './types';

export interface BuildScopeInput {
  walletId: string;
  periodPreset?: string | number | null;
  periodDays: number;
  now: number;
  plan?: string | null;
  entity?: {
    asset?: string | null;
    network?: string | null;
    counterparty?: string | null;
    transactionType?: string | null;
  };
  filters?: Record<string, unknown> | null;
  source: AnalysisDataSource;
  processedRecords?: number;
  matchingRecords?: number | null;
  truncated: boolean;
  truncationReason?: string;
  /** True only when the entire entitled transaction scope was processed exactly. */
  isFullEntitledHistory: boolean;
  coverageStatus?: CoverageStatus;
  asOf?: AnalysisScope['asOf'];
  entitlementLimitations?: string[];
}

export function periodBounds(periodDays: number, now: number): { from: string; to: string } {
  const to = new Date(now).toISOString();
  const fromMs = now - Math.max(1, periodDays) * 24 * 60 * 60 * 1000;
  return { from: new Date(fromMs).toISOString(), to };
}

export function buildAnalysisScope(input: BuildScopeInput): AnalysisScope {
  const bounds = periodBounds(input.periodDays, input.now);
  const preset =
    input.periodPreset === null || input.periodPreset === undefined
      ? undefined
      : String(input.periodPreset);

  let status: CoverageStatus = input.coverageStatus ?? 'complete';
  if (input.truncated) status = 'partial';
  if (input.matchingRecords === 0 && !input.truncated) {
    // empty success stays complete for that empty domain, but caller may override
  }

  return {
    walletId: input.walletId,
    requestedPeriod: {
      preset,
      from: bounds.from,
      to: bounds.to,
    },
    entitlementScope: {
      allowedFrom: null,
      allowedTo: bounds.to,
      plan: (input.plan ?? 'unknown').toLowerCase(),
      limitations: input.entitlementLimitations ?? [],
    },
    entityScope: {
      asset: input.entity?.asset ?? undefined,
      network: input.entity?.network ?? undefined,
      counterparty: input.entity?.counterparty ?? undefined,
      transactionType: input.entity?.transactionType ?? undefined,
    },
    filters: input.filters ?? {},
    source: input.source,
    coverage: {
      status,
      processedRecords: input.processedRecords,
      matchingRecords: input.matchingRecords ?? undefined,
      isFullEntitledHistory: input.isFullEntitledHistory === true && !input.truncated,
      truncated: input.truncated,
      truncationReason: input.truncationReason,
    },
    asOf: input.asOf ?? {},
  };
}

export function assertNoFalseFullHistory(scope: AnalysisScope): AnalysisScope {
  if (scope.coverage.truncated || scope.coverage.status === 'partial') {
    return {
      ...scope,
      coverage: {
        ...scope.coverage,
        isFullEntitledHistory: false,
      },
    };
  }
  return scope;
}

/** Soft sync row budget — transport/memory safety, never presented as full history. */
export const SYNC_TRANSACTION_ROW_BUDGET = 5000;

export function coverageFromLoad(args: {
  loaded: number;
  matchingTotal: number | null;
  mode: DataRequirementsPlan['transactions']['mode'];
}): {
  truncated: boolean;
  isFullEntitledHistory: boolean;
  truncationReason?: string;
  status: CoverageStatus;
} {
  if (args.mode === 'none') {
    return {
      truncated: false,
      isFullEntitledHistory: false,
      status: 'not_required',
    };
  }

  if (args.mode === 'aggregate') {
    return {
      truncated: false,
      isFullEntitledHistory: true,
      status: 'complete',
    };
  }

  const total = args.matchingTotal;
  if (total === null) {
    return {
      truncated: args.loaded >= SYNC_TRANSACTION_ROW_BUDGET,
      isFullEntitledHistory: false,
      truncationReason:
        args.loaded >= SYNC_TRANSACTION_ROW_BUDGET
          ? 'Row budget reached; matching total unknown'
          : 'Matching total unknown; completeness not verified',
      status: 'partial',
    };
  }

  if (args.mode === 'full_entitled_history') {
    const complete = args.loaded >= total && total >= 0;
    return {
      truncated: !complete,
      isFullEntitledHistory: complete,
      truncationReason: complete
        ? undefined
        : `Processed ${args.loaded} of ${total} entitled transactions; async/chunked processing required for remainder`,
      status: complete ? 'complete' : 'partial',
    };
  }

  // filtered
  const truncated = args.loaded < total;
  return {
    truncated,
    isFullEntitledHistory: !truncated && total === args.loaded,
    truncationReason: truncated
      ? `Filtered load processed ${args.loaded} of ${total} matching rows`
      : undefined,
    status: truncated ? 'partial' : 'complete',
  };
}
