/**
 * Normalize engine metrics + findings into deterministic AnalyticalObservations.
 * Facts only — no interpretive claims.
 */

import type { EngineOutput } from '@/lib/ai/tools/registry';
import type { AnalysisScope, ConfidenceScore, EvidenceItem } from '@/lib/ai/trust/types';
import { ENGINE_VERSIONS } from '@/lib/ai/trust/types';

import { numberOrNull, scoreConfidence } from './confidence-util';
import type { AnalyticalObservation, ObservationEntityType } from './types';

function obsId(engine: string, key: string, entity?: string): string {
  const ent = entity ? `:${entity}` : '';
  return `obs:${engine}:${key}${ent}`.toLowerCase().replace(/[^a-z0-9:_.-]/g, '_');
}

function confFromEngine(completeness: number, txCount: number): ConfidenceScore {
  const sample = txCount >= 20 ? 90 : txCount >= 5 ? 65 : txCount > 0 ? 40 : 20;
  return scoreConfidence({
    data: completeness * 100,
    pricing: completeness * 100,
    sample,
    historical: completeness >= 0.8 ? 75 : 45,
  });
}

function pushMetricObs(
  out: AnalyticalObservation[],
  args: {
    engine: string;
    type: string;
    key: string;
    value: number | string | boolean | null;
    unit?: string;
    entityType: ObservationEntityType;
    entityId?: string;
    symbol?: string;
    name?: string;
    changeValue?: number | null;
    changePct?: number | null;
    comparisonValue?: number | string | null;
    scope: AnalysisScope;
    confidence: ConfidenceScore;
    evidenceIds: string[];
    generatedAt: string;
  },
): void {
  out.push({
    id: obsId(args.engine, args.key, args.entityId ?? args.symbol),
    type: args.type,
    engine: args.engine,
    engineVersion: ENGINE_VERSIONS[args.engine] ?? '2.0.0',
    entity: {
      type: args.entityType,
      id: args.entityId,
      symbol: args.symbol,
      name: args.name,
    },
    metric: {
      key: args.key,
      value: args.value,
      unit: args.unit,
      comparisonValue: args.comparisonValue,
      changeValue: args.changeValue,
      changePct: args.changePct,
    },
    scope: args.scope,
    evidenceIds: args.evidenceIds,
    confidence: args.confidence,
    generatedAt: args.generatedAt,
  });
}

function relatedEvidenceIds(evidence: EvidenceItem[], engine: string, keys: string[]): string[] {
  const set = new Set(keys.map(k => k.toLowerCase()));
  return evidence
    .filter(
      e =>
        e.calculation.engine === engine ||
        set.has(e.metric.toLowerCase()) ||
        set.has(String(e.type).toLowerCase()),
    )
    .map(e => e.evidenceId)
    .slice(0, 8);
}

/** Extract numeric leaves from engine metrics for observation emission. */
function walkMetrics(
  metrics: Record<string, unknown>,
  prefix: string,
  visit: (key: string, value: number) => void,
  depth = 0,
): void {
  if (depth > 3) return;
  for (const [k, v] of Object.entries(metrics)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' && Number.isFinite(v)) {
      visit(path, v);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkMetrics(v as Record<string, unknown>, path, visit, depth + 1);
    } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
      // Top asset/network rows — emit first few symbols
      for (const row of v.slice(0, 5)) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const symbol = String(r.symbol ?? r.network ?? r.displayName ?? r.name ?? '');
        const allocation = numberOrNull(r.allocationPct ?? r.sharePct ?? r.dominancePct);
        const valueUsd = numberOrNull(r.valueUsd ?? r.amountUsd ?? r.totalVolumeUsd);
        if (symbol && allocation != null) visit(`${path}.${symbol}.allocationPct`, allocation);
        if (symbol && valueUsd != null) visit(`${path}.${symbol}.valueUsd`, valueUsd);
        const count = numberOrNull(r.interactionCount ?? r.count ?? r.txCount);
        if (symbol && count != null) visit(`${path}.${symbol}.interactionCount`, count);
      }
    }
  }
}

export function normalizeObservations(input: {
  envelopes: EngineOutput[];
  scope: AnalysisScope;
  evidence: EvidenceItem[];
  generatedAt?: string;
}): AnalyticalObservation[] {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const out: AnalyticalObservation[] = [];

  for (const envelope of input.envelopes) {
    const confidence = confFromEngine(
      envelope.dataQuality.completeness,
      envelope.dataQuality.transactionCount,
    );
    const evidenceIds = relatedEvidenceIds(input.evidence, envelope.engine, Object.keys(envelope.metrics));

    walkMetrics(envelope.metrics as Record<string, unknown>, '', (key, value) => {
      const symbolMatch = key.match(/\.([A-Z0-9]{2,15})\.(allocationPct|valueUsd|interactionCount)$/i);
      const entityType: ObservationEntityType =
        envelope.engine === 'network'
          ? 'network'
          : envelope.engine === 'counterparty'
            ? 'counterparty'
            : symbolMatch
              ? 'asset'
              : envelope.engine === 'portfolio' || envelope.engine === 'performance'
                ? 'portfolio'
                : 'period';

      pushMetricObs(out, {
        engine: envelope.engine,
        type: `metric_${key.replace(/\./g, '_')}`,
        key,
        value,
        unit: key.includes('Pct') || key.includes('pct') ? 'pct' : key.includes('Usd') ? 'usd' : 'count',
        entityType,
        symbol: symbolMatch?.[1],
        entityId: symbolMatch?.[1],
        scope: input.scope,
        confidence,
        evidenceIds,
        generatedAt,
        changeValue: key.includes('change') ? value : null,
      });
    });

    // Explicit capital / return separation metrics when engines emit them
    const m = envelope.metrics as Record<string, unknown>;
    const named: Array<[string, number | null, string]> = [
      ['externalInflowUsd', numberOrNull(m.externalInflowUsd ?? m.inflowUsd), 'usd'],
      ['externalOutflowUsd', numberOrNull(m.externalOutflowUsd ?? m.outflowUsd), 'usd'],
      ['internalTransferUsd', numberOrNull(m.internalTransferUsd), 'usd'],
      ['investmentReturnUsd', numberOrNull(m.investmentReturnUsd), 'usd'],
      ['netExternalFlowUsd', numberOrNull(m.netExternalFlowUsd), 'usd'],
      ['valueChangeUsd', numberOrNull(m.valueChangeUsd ?? m.portfolioChangeUsd), 'usd'],
    ];
    for (const [key, value, unit] of named) {
      if (value == null) continue;
      pushMetricObs(out, {
        engine: envelope.engine,
        type: `capital_${key}`,
        key,
        value,
        unit,
        entityType: 'portfolio',
        entityId: 'portfolio',
        scope: input.scope,
        confidence,
        evidenceIds,
        generatedAt,
      });
    }

    // Finding-backed factual observations (evidence maps only)
    for (const finding of envelope.findings) {
      for (const [ek, ev] of Object.entries(finding.evidence ?? {})) {
        if (typeof ev !== 'number' && typeof ev !== 'string' && typeof ev !== 'boolean') continue;
        const entitySymbol = finding.relatedEntities?.[0];
        pushMetricObs(out, {
          engine: envelope.engine,
          type: `finding_metric_${finding.type}_${ek}`,
          key: `${finding.type}.${ek}`,
          value: ev,
          unit: ek.includes('pct') || ek.includes('Pct') ? 'pct' : ek.includes('usd') || ek.includes('Usd') ? 'usd' : undefined,
          entityType:
            envelope.engine === 'counterparty'
              ? 'counterparty'
              : envelope.engine === 'network'
                ? 'network'
                : entitySymbol
                  ? 'asset'
                  : 'portfolio',
          symbol: entitySymbol,
          entityId: entitySymbol,
          name: entitySymbol,
          scope: input.scope,
          confidence,
          evidenceIds: relatedEvidenceIds(input.evidence, envelope.engine, [ek, finding.type]),
          generatedAt,
        });
      }
    }
  }

  // Stable sort + de-dupe by id
  const byId = new Map<string, AnalyticalObservation>();
  for (const obs of out) {
    if (!byId.has(obs.id)) byId.set(obs.id, obs);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
