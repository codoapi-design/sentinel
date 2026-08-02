import type { Insight } from '@/lib/ai/intelligence';
import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { DomainStatus } from '@/lib/ai/trust/types';

import type { RelevanceContext } from '../ranking';
import type { BenchmarkFixture } from './types';

export function makeFinding(
  partial: Partial<Insight> & Pick<Insight, 'id' | 'type' | 'title'>,
): Insight {
  return {
    description: partial.description ?? partial.title,
    severity: partial.severity ?? 'medium',
    confidence: partial.confidence ?? 'medium',
    evidence: partial.evidence ?? {},
    category: partial.category,
    impactUsd: partial.impactUsd,
    relatedEntities: partial.relatedEntities,
    ...partial,
  };
}

export function makeEnvelope(
  engine: string,
  findings: Insight[],
  metrics: Record<string, unknown> = {},
  dq: Partial<EngineOutput['dataQuality']> = {},
): EngineOutput {
  return {
    engine,
    status: 'completed',
    summary: `${engine} summary`,
    metrics,
    patterns: [],
    findings,
    evidence: {},
    confidence: 'medium',
    dataQuality: {
      transactionCount: dq.transactionCount ?? 40,
      pricedCount: dq.pricedCount ?? 36,
      unpricedCount: dq.unpricedCount ?? 4,
      completeness: dq.completeness ?? 0.9,
      truncated: dq.truncated ?? false,
      notes: dq.notes ?? [],
    },
    recommendedFollowup: [],
    tool: 'get_portfolio_overview',
    periodDays: 90,
    generatedAt: Date.now(),
  };
}

export const FULL_DOMAINS: DomainStatus[] = [
  { domain: 'wallet', status: 'available', notes: [] },
  { domain: 'holdings', status: 'available', notes: [] },
  { domain: 'transactions', status: 'available', notes: [] },
  { domain: 'pricing', status: 'available', notes: [] },
  { domain: 'snapshots', status: 'available', notes: [] },
  { domain: 'counterparties', status: 'available', notes: [] },
  { domain: 'investment_return', status: 'available', notes: [] },
  { domain: 'trading_volume', status: 'available', notes: [] },
];

export const NO_SNAPSHOT_DOMAINS: DomainStatus[] = FULL_DOMAINS.map(d =>
  d.domain === 'snapshots' ? { ...d, status: 'unavailable', notes: ['no snapshots'] } : d,
);

export function fixture(partial: Omit<BenchmarkFixture, 'version'> & { version?: string }): BenchmarkFixture {
  return {
    version: partial.version ?? '1.0.0',
    domainStatuses: partial.domainStatuses ?? FULL_DOMAINS,
    analysisLevelLabel: partial.analysisLevelLabel ?? 'wallet',
    ...partial,
  };
}

export function page(ctx: RelevanceContext): RelevanceContext {
  return ctx;
}
