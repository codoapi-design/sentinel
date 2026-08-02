/**
 * Module 02 — Flow Intelligence (Spec §5.15–§5.30).
 *
 * Turns raw movement into an understanding of capital direction, sources,
 * destinations, and behaviour change.
 *
 * `Transaction Movement ≠ Financial Intent` (Spec §5.16): the engine describes
 * observed movement and never infers buying, selling, or motive.
 */

import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import { SUMMARY_INFLOW, SUMMARY_OUTFLOW } from '@/lib/finance/labels';
import {
  buildComparison,
  buildDataQuality,
  compactEvidence,
  daysBetween,
  deriveConfidence,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  isInternalCounterparty,
  isoDay,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  MATERIAL_USD_THRESHOLD,
  mean,
  normalizeAddress,
  ownedAddressSet,
  pctChange,
  resolvePeriod,
  resolvePortfolioValueUsd,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  splitByPeriod,
  sum,
  topN,
  txDirection,
  txNetwork,
  txTimestampMs,
  txType,
  txUsd,
  type ResolvedPeriod,
} from './shared';
import type {
  Confidence,
  Evidence,
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  IntelligenceTransaction,
  Pattern,
  PeriodComparison,
} from './types';

/** Inflow classifications (Spec §5.20). */
export type InflowType = 'external_deposit' | 'internal_transfer' | 'trading_return' | 'protocol_reward';

/** Outflow classifications (Spec §5.20). */
export type OutflowType =
  | 'exchange_transfer'
  | 'external_wallet'
  | 'contract_interaction'
  | 'internal_movement';

export type FlowClassification = InflowType | OutflowType;

/** Capital direction over the window (Spec §5.17). */
export type CapitalDirection = 'accumulating' | 'distributing' | 'balanced' | 'inactive';

export interface FlowEvent {
  id: string;
  txHash: string;
  date: string;
  timestampMs: number;
  direction: 'in' | 'out';
  amountUsd: number;
  classification: FlowClassification;
  counterparty: string;
  counterpartyDisplay: string;
  network: string;
  token: string;
}

export interface FlowTypeBreakdown {
  classification: FlowClassification;
  count: number;
  amountUsd: number;
  sharePct: number;
}

export interface FlowCounterpartyTotal {
  counterparty: string;
  displayName: string;
  amountUsd: number;
  count: number;
  sharePct: number;
}

export interface FlowMetrics {
  periodDays: number;
  totalInflowUsd: number;
  totalOutflowUsd: number;
  netFlowUsd: number;
  inflowCount: number;
  outflowCount: number;
  flowCount: number;
  averageFlowUsd: number;
  largestInflow: FlowEvent | null;
  largestOutflow: FlowEvent | null;
  /** Moved volume relative to portfolio value; `null` when value is unknown. */
  flowVelocity: number | null;
  /** Movements per 30 days over the window. */
  flowFrequencyPerMonth: number;
  activeDays: number;
  daysSinceLastFlow: number | null;
  daysSincePreviousActivity: number | null;
  inflowByType: FlowTypeBreakdown[];
  outflowByType: FlowTypeBreakdown[];
  topSources: FlowCounterpartyTotal[];
  topDestinations: FlowCounterpartyTotal[];
  inflow: PeriodComparison;
  outflow: PeriodComparison;
  netFlow: PeriodComparison;
  averageFlow: PeriodComparison;
  /** 0–100 — frequency, volume, and recency of movement (Spec §5.22). */
  capitalActivityScore: number;
  /** 0–100 — higher means more regular movement sizes and timing. */
  flowStabilityScore: number;
  /** 0–100 — how much of the value change is matched by incoming capital. */
  externalDependencyScore: number;
  direction: CapitalDirection;
  events: FlowEvent[];
}

export type FlowIntelligence = IntelligenceResult<FlowMetrics>;

const EXCHANGE_HINTS = [
  'binance', 'coinbase', 'kraken', 'okx', 'bybit', 'kucoin', 'bitfinex', 'gate.io', 'gemini',
  'crypto.com', 'huobi', 'htx', 'mexc', 'bitget', 'upbit', 'bithumb', 'exchange', 'cex',
];

const LARGE_EVENT_MULTIPLIER = 3;
const BEHAVIOR_CHANGE_MULTIPLIER = 2;
const DORMANCY_DAYS = 45;

export function analyzeFlow(input: IntelligenceInput): FlowIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const owned = ownedAddressSet(input);
  const clients = input.clients ?? [];

  const split = splitByPeriod(txs, txTimestampMs, period);
  const currentEvents = buildEvents(split.current, owned, clients, period);
  const previousEvents = buildEvents(split.previous, owned, clients, period);
  const historicalEvents = buildEvents(split.older, owned, clients, period);

  const inflowEvents = currentEvents.filter(e => e.direction === 'in');
  const outflowEvents = currentEvents.filter(e => e.direction === 'out');
  const totalInflowUsd = round2(sum(inflowEvents.map(e => e.amountUsd)));
  const totalOutflowUsd = round2(sum(outflowEvents.map(e => e.amountUsd)));
  const netFlowUsd = round2(totalInflowUsd - totalOutflowUsd);
  const movedVolumeUsd = round2(totalInflowUsd + totalOutflowUsd);

  const previousInflowUsd = round2(
    sum(previousEvents.filter(e => e.direction === 'in').map(e => e.amountUsd)),
  );
  const previousOutflowUsd = round2(
    sum(previousEvents.filter(e => e.direction === 'out').map(e => e.amountUsd)),
  );

  const portfolioValueUsd = resolvePortfolioValueUsd(input);
  const activeDays = new Set(currentEvents.map(e => e.date)).size;
  const lastFlowMs = currentEvents.length
    ? Math.max(...currentEvents.map(e => e.timestampMs))
    : null;
  const previousActivityMs = previousEvents.length || historicalEvents.length
    ? Math.max(
        ...[...previousEvents, ...historicalEvents].map(e => e.timestampMs),
      )
    : null;

  const averageFlowUsd = currentEvents.length
    ? round2(movedVolumeUsd / currentEvents.length)
    : 0;
  const previousAverageFlowUsd = previousEvents.length
    ? round2((previousInflowUsd + previousOutflowUsd) / previousEvents.length)
    : 0;

  const metrics: FlowMetrics = {
    periodDays: period.days,
    totalInflowUsd,
    totalOutflowUsd,
    netFlowUsd,
    inflowCount: inflowEvents.length,
    outflowCount: outflowEvents.length,
    flowCount: currentEvents.length,
    averageFlowUsd,
    largestInflow: largestEvent(inflowEvents),
    largestOutflow: largestEvent(outflowEvents),
    flowVelocity: portfolioValueUsd > 0 ? round2(movedVolumeUsd / portfolioValueUsd) : null,
    flowFrequencyPerMonth: round1((currentEvents.length / period.days) * 30),
    activeDays,
    daysSinceLastFlow: lastFlowMs != null ? round1(daysBetween(lastFlowMs, period.now)) : null,
    daysSincePreviousActivity:
      previousActivityMs != null ? round1(daysBetween(previousActivityMs, period.now)) : null,
    inflowByType: breakdown(inflowEvents, totalInflowUsd),
    outflowByType: breakdown(outflowEvents, totalOutflowUsd),
    topSources: groupCounterparties(inflowEvents, totalInflowUsd),
    topDestinations: groupCounterparties(outflowEvents, totalOutflowUsd),
    inflow: buildComparison(totalInflowUsd, previousInflowUsd),
    outflow: buildComparison(totalOutflowUsd, previousOutflowUsd),
    netFlow: buildComparison(netFlowUsd, round2(previousInflowUsd - previousOutflowUsd)),
    averageFlow: buildComparison(averageFlowUsd, previousAverageFlowUsd),
    capitalActivityScore: computeCapitalActivityScore({
      flowCount: currentEvents.length,
      periodDays: period.days,
      movedVolumeUsd,
      portfolioValueUsd,
      daysSinceLastFlow: lastFlowMs != null ? daysBetween(lastFlowMs, period.now) : null,
    }),
    flowStabilityScore: computeFlowStabilityScore(currentEvents, period),
    externalDependencyScore: computeExternalDependencyScore(
      totalInflowUsd,
      netFlowUsd,
      portfolioValueUsd,
    ),
    direction: resolveCapitalDirection(currentEvents.length, totalInflowUsd, totalOutflowUsd),
    events: currentEvents,
  };

  const confidence = lowestConfidence(
    input.dataGrounding === 'screen' && dataQuality.completeness >= 50
      ? 'high'
      : deriveConfidence(dataQuality, {
          minSampleForHigh: 12,
          minSampleForMedium: 3,
        }),
    currentEvents.length === 0 ? 'low' : 'high',
  );

  const patterns = detectPatterns(metrics, {
    period,
    confidence,
    previousEvents,
    historicalEvents,
    portfolioValueUsd,
  });
  const insights = buildInsights(metrics, patterns, period, confidence);

  return {
    summary: buildSummary(metrics, period),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: formatPeriodLabel(period.days),
      total_inflow_usd: metrics.totalInflowUsd,
      total_outflow_usd: metrics.totalOutflowUsd,
      net_flow_usd: metrics.netFlowUsd,
      flow_count: metrics.flowCount,
      average_flow_usd: metrics.averageFlowUsd,
      flow_velocity: metrics.flowVelocity,
      capital_activity_score: metrics.capitalActivityScore,
      flow_stability_score: metrics.flowStabilityScore,
      external_dependency_score: metrics.externalDependencyScore,
      direction: metrics.direction,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Event construction & classification (Spec §5.20)
// ---------------------------------------------------------------------------

function buildEvents(
  txs: IntelligenceTransaction[],
  owned: Set<string>,
  clients: IntelligenceInput['clients'],
  period: ResolvedPeriod,
): FlowEvent[] {
  const events: FlowEvent[] = [];
  for (const tx of txs) {
    const direction = txDirection(tx);
    if (direction == null) continue;
    const amountUsd = txUsd(tx);
    if (amountUsd == null || amountUsd < MATERIAL_USD_THRESHOLD) continue;
    const ms = txTimestampMs(tx);
    if (ms == null) continue;

    const type = txType(tx);
    const internal = isInternalCounterparty(tx, owned);
    const counterparty = normalizeAddress(tx.counterparty);
    const counterpartyDisplay = resolveCounterpartyDisplay(
      { counterparty: tx.counterparty, counterpartyLabel: tx.counterpartyLabel },
      clients ?? [],
    );

    events.push({
      id: String(tx.id || tx.txHash || `${ms}-${events.length}`),
      txHash: String(tx.txHash || tx.tx_hash || tx.hash || ''),
      date: isoDay(ms),
      timestampMs: ms,
      direction,
      amountUsd: round2(amountUsd),
      classification:
        direction === 'in'
          ? classifyInflow(type, internal)
          : classifyOutflow(type, internal, tx, counterpartyDisplay),
      counterparty,
      counterpartyDisplay,
      network: txNetwork(tx),
      token: (tx.token || '').toString().toUpperCase() || 'UNKNOWN',
    });
  }
  void period;
  return events.sort((a, b) => a.timestampMs - b.timestampMs);
}

function classifyInflow(type: string, internal: boolean): InflowType {
  if (internal) return 'internal_transfer';
  if (type === 'staking') return 'protocol_reward';
  if (type === 'trade') return 'trading_return';
  return 'external_deposit';
}

function classifyOutflow(
  type: string,
  internal: boolean,
  tx: IntelligenceTransaction,
  display: string,
): OutflowType {
  if (internal) return 'internal_movement';
  if (looksLikeExchange(display, tx.counterpartyLabel, tx.protocol)) return 'exchange_transfer';
  if (type === 'defi' || type === 'nft' || type === 'bridge' || tx.protocol) {
    return 'contract_interaction';
  }
  return 'external_wallet';
}

function looksLikeExchange(...labels: Array<string | null | undefined>): boolean {
  for (const label of labels) {
    const value = (label ?? '').toString().toLowerCase();
    if (!value) continue;
    if (EXCHANGE_HINTS.some(hint => value.includes(hint))) return true;
  }
  return false;
}

function largestEvent(events: FlowEvent[]): FlowEvent | null {
  if (events.length === 0) return null;
  return events.reduce((max, event) => (event.amountUsd > max.amountUsd ? event : max), events[0]);
}

function breakdown(events: FlowEvent[], total: number): FlowTypeBreakdown[] {
  const map = new Map<FlowClassification, { count: number; amountUsd: number }>();
  for (const event of events) {
    const entry = map.get(event.classification) ?? { count: 0, amountUsd: 0 };
    entry.count += 1;
    entry.amountUsd += event.amountUsd;
    map.set(event.classification, entry);
  }
  return [...map.entries()]
    .map(([classification, entry]) => ({
      classification,
      count: entry.count,
      amountUsd: round2(entry.amountUsd),
      sharePct: sharePct(entry.amountUsd, total),
    }))
    .sort((a, b) => (b.amountUsd === a.amountUsd ? a.classification.localeCompare(b.classification) : b.amountUsd - a.amountUsd));
}

function groupCounterparties(events: FlowEvent[], total: number): FlowCounterpartyTotal[] {
  const map = new Map<string, { displayName: string; amountUsd: number; count: number }>();
  for (const event of events) {
    const key = event.counterparty || event.counterpartyDisplay;
    const entry = map.get(key) ?? { displayName: event.counterpartyDisplay, amountUsd: 0, count: 0 };
    entry.amountUsd += event.amountUsd;
    entry.count += 1;
    map.set(key, entry);
  }
  const totals = [...map.entries()].map(([counterparty, entry]) => ({
    counterparty,
    displayName: entry.displayName,
    amountUsd: round2(entry.amountUsd),
    count: entry.count,
    sharePct: sharePct(entry.amountUsd, total),
  }));
  return topN(totals, 5, t => t.amountUsd);
}

// ---------------------------------------------------------------------------
// Scores (Spec §5.22)
// ---------------------------------------------------------------------------

function computeCapitalActivityScore(args: {
  flowCount: number;
  periodDays: number;
  movedVolumeUsd: number;
  portfolioValueUsd: number;
  daysSinceLastFlow: number | null;
}): number {
  // Frequency: 1 movement per 3 days saturates the component.
  const perDay = args.flowCount / Math.max(1, args.periodDays);
  const frequency = score100((perDay / (1 / 3)) * 100);
  // Volume: moving the portfolio value once over the window saturates the component.
  const turnover =
    args.portfolioValueUsd > 0 ? args.movedVolumeUsd / args.portfolioValueUsd : args.flowCount > 0 ? 0.5 : 0;
  const volume = score100(turnover * 100);
  // Recency: fully decayed once nothing has moved for the length of the window.
  const recency =
    args.daysSinceLastFlow == null
      ? 0
      : score100(100 - (args.daysSinceLastFlow / Math.max(1, args.periodDays)) * 100);
  return score100(frequency * 0.4 + volume * 0.35 + recency * 0.25);
}

function computeFlowStabilityScore(events: FlowEvent[], period: ResolvedPeriod): number {
  if (events.length < 3) return 50;
  const amounts = events.map(e => e.amountUsd);
  const averageAmount = mean(amounts);
  const amountSpread =
    averageAmount > 0
      ? Math.sqrt(mean(amounts.map(a => (a - averageAmount) ** 2))) / averageAmount
      : 0;

  const gaps: number[] = [];
  for (let i = 1; i < events.length; i += 1) {
    gaps.push(daysBetween(events[i - 1].timestampMs, events[i].timestampMs));
  }
  const averageGap = mean(gaps);
  const gapSpread =
    averageGap > 0 ? Math.sqrt(mean(gaps.map(g => (g - averageGap) ** 2))) / averageGap : 0;

  void period;
  // A coefficient of variation of 2 or more is treated as fully erratic.
  const sizeScore = score100(100 - (amountSpread / 2) * 100);
  const timingScore = score100(100 - (gapSpread / 2) * 100);
  return score100(sizeScore * 0.6 + timingScore * 0.4);
}

function computeExternalDependencyScore(
  inflowUsd: number,
  netFlowUsd: number,
  portfolioValueUsd: number,
): number {
  if (portfolioValueUsd <= 0) return inflowUsd > 0 ? 100 : 0;
  const dependency = Math.max(0, netFlowUsd) / portfolioValueUsd;
  return score100(dependency * 100 * 2);
}

function resolveCapitalDirection(
  flowCount: number,
  inflowUsd: number,
  outflowUsd: number,
): CapitalDirection {
  if (flowCount === 0) return 'inactive';
  const total = inflowUsd + outflowUsd;
  if (total <= 0) return 'inactive';
  const netShare = ((inflowUsd - outflowUsd) / total) * 100;
  if (netShare >= 20) return 'accumulating';
  if (netShare <= -20) return 'distributing';
  return 'balanced';
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.21)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: FlowMetrics,
  context: {
    period: ResolvedPeriod;
    confidence: Confidence;
    previousEvents: FlowEvent[];
    historicalEvents: FlowEvent[];
    portfolioValueUsd: number;
  },
): Pattern[] {
  const patterns: Pattern[] = [];
  const { period, confidence } = context;
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — Capital Accumulation
  if (metrics.direction === 'accumulating' && metrics.inflowCount >= 2) {
    patterns.push({
      id: makePatternId('flow', 'capital_accumulation'),
      type: 'capital_accumulation',
      name: 'Capital Accumulation',
      description: 'Capital entered the wallet repeatedly during the period without matching outgoing movement.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        inflow_usd: metrics.totalInflowUsd,
        outflow_usd: metrics.totalOutflowUsd,
        net_flow_usd: metrics.netFlowUsd,
        inflow_count: metrics.inflowCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 2 — Distribution
  if (metrics.direction === 'distributing' && metrics.outflowCount >= 2) {
    patterns.push({
      id: makePatternId('flow', 'distribution'),
      type: 'distribution',
      name: 'Distribution Pattern',
      description: 'Outgoing movement exceeded incoming movement across repeated transfers during the period.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        inflow_usd: metrics.totalInflowUsd,
        outflow_usd: metrics.totalOutflowUsd,
        net_flow_usd: metrics.netFlowUsd,
        outflow_count: metrics.outflowCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Growth Without Inflows
  const netFlowShareOfValue =
    context.portfolioValueUsd > 0 ? Math.abs(metrics.netFlowUsd) / context.portfolioValueUsd : null;
  if (netFlowShareOfValue != null && netFlowShareOfValue < 0.02 && metrics.flowCount > 0) {
    patterns.push({
      id: makePatternId('flow', 'growth_without_inflows'),
      type: 'growth_without_inflows',
      name: 'Growth Without Inflows',
      description:
        'Net capital movement over the period is negligible relative to portfolio value, so value changes are not explained by transfers.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        net_flow_usd: metrics.netFlowUsd,
        portfolio_value_usd: round2(context.portfolioValueUsd),
        net_flow_share_pct: round2(netFlowShareOfValue * 100),
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Large Capital Event
  const baselineAverage = historicalAverage(context.previousEvents, context.historicalEvents);
  const largest = pickLargest(metrics.largestInflow, metrics.largestOutflow);
  if (largest && baselineAverage > 0 && largest.amountUsd >= baselineAverage * LARGE_EVENT_MULTIPLIER) {
    patterns.push({
      id: makePatternId('flow', 'large_capital_event', largest.id),
      type: 'large_capital_event',
      name: 'Large Capital Event',
      description: 'A single movement during the period was several times larger than the wallet\'s historical average transfer.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        amount_usd: largest.amountUsd,
        direction: largest.direction,
        classification: largest.classification,
        counterparty: largest.counterpartyDisplay,
        historical_average_usd: round2(baselineAverage),
        multiple_of_average: round2(largest.amountUsd / baselineAverage),
        date: largest.date,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Flow Behavior Change
  const averagePrevious = metrics.averageFlow.previous;
  if (
    averagePrevious > 0 &&
    metrics.averageFlow.current > 0 &&
    (metrics.averageFlow.current >= averagePrevious * BEHAVIOR_CHANGE_MULTIPLIER ||
      metrics.averageFlow.current * BEHAVIOR_CHANGE_MULTIPLIER <= averagePrevious)
  ) {
    patterns.push({
      id: makePatternId('flow', 'flow_behavior_change'),
      type: 'flow_behavior_change',
      name: 'Flow Behavior Change',
      description: 'Average movement size changed materially compared with the previous period of the same length.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        previous_average_usd: metrics.averageFlow.previous,
        current_average_usd: metrics.averageFlow.current,
        change_pct: metrics.averageFlow.changePct,
        previous_flow_count: context.previousEvents.length,
        current_flow_count: metrics.flowCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 6 — Dormant Wallet Activation
  const dormantGap = dormancyGap(context.previousEvents, context.historicalEvents, period);
  if (
    dormantGap != null &&
    dormantGap >= DORMANCY_DAYS &&
    metrics.flowCount > 0 &&
    metrics.capitalActivityScore >= 20
  ) {
    patterns.push({
      id: makePatternId('flow', 'dormant_wallet_activation'),
      type: 'dormant_wallet_activation',
      name: 'Dormant Wallet Activation',
      description: 'Movement resumed after an extended period without recorded transfers.',
      category: 'flow',
      confidence,
      evidence: compactEvidence({
        inactive_days_before_period: round1(dormantGap),
        flow_count: metrics.flowCount,
        moved_volume_usd: round2(metrics.totalInflowUsd + metrics.totalOutflowUsd),
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

function historicalAverage(previous: FlowEvent[], older: FlowEvent[]): number {
  const amounts = [...previous, ...older].map(e => e.amountUsd);
  return amounts.length === 0 ? 0 : mean(amounts);
}

function pickLargest(a: FlowEvent | null, b: FlowEvent | null): FlowEvent | null {
  if (a && b) return a.amountUsd >= b.amountUsd ? a : b;
  return a ?? b;
}

/** Days between the last movement before the window and the window start. */
function dormancyGap(
  previous: FlowEvent[],
  older: FlowEvent[],
  period: ResolvedPeriod,
): number | null {
  const before = [...previous, ...older];
  if (before.length === 0) return null;
  const lastMs = Math.max(...before.map(e => e.timestampMs));
  return daysBetween(lastMs, period.currentStart);
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.23 / §5.24)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: FlowMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
  confidence: Confidence,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  if (metrics.flowCount === 0) {
    insights.push({
      id: makeInsightId('flow', 'no_movement'),
      type: 'no_capital_movement',
      category: 'flow',
      title: `No priced capital movement recorded over ${periodLabel}`,
      description: `No incoming or outgoing transfers with a usable USD amount were recorded in the last ${period.days} days.`,
      severity: 'informational',
      confidence,
      impactUsd: null,
      evidence: compactEvidence({
        flow_count: 0,
        period: periodLabel,
        days_since_previous_activity: metrics.daysSincePreviousActivity,
      }),
    });
    return insights;
  }

  insights.push({
    id: makeInsightId('flow', 'net_flow'),
    type: 'net_capital_movement',
    category: 'flow',
    title:
      metrics.netFlowUsd >= 0
        ? `Net capital movement was ${formatUsd(metrics.netFlowUsd)} into the wallet`
        : `Net capital movement was ${formatUsd(Math.abs(metrics.netFlowUsd))} out of the wallet`,
    description: `${SUMMARY_INFLOW} totalled ${formatUsd(metrics.totalInflowUsd)} across ${metrics.inflowCount} movement(s) and ${SUMMARY_OUTFLOW} totalled ${formatUsd(metrics.totalOutflowUsd)} across ${metrics.outflowCount} movement(s) over the last ${period.days} days. The data records movement only; it does not indicate why value moved.`,
    severity: 'informational',
    confidence,
    impactUsd: Math.abs(metrics.netFlowUsd),
    evidence: compactEvidence({
      total_inflow_usd: metrics.totalInflowUsd,
      total_outflow_usd: metrics.totalOutflowUsd,
      net_flow_usd: metrics.netFlowUsd,
      inflow_count: metrics.inflowCount,
      outflow_count: metrics.outflowCount,
      period: periodLabel,
    }),
  });

  const topDestination = metrics.topDestinations[0];
  if (topDestination && topDestination.sharePct >= 40) {
    insights.push({
      id: makeInsightId('flow', 'concentrated_destination', topDestination.counterparty || topDestination.displayName),
      type: 'concentrated_outflow_destination',
      category: 'flow',
      title: `${formatPct(topDestination.sharePct)} of outgoing value went to one counterparty`,
      description: `Outgoing movement over ${periodLabel} is concentrated in ${topDestination.displayName}, which received ${formatUsd(topDestination.amountUsd)} across ${topDestination.count} movement(s). The destination classification describes the address, not the purpose of the transfer.`,
      severity: topDestination.sharePct >= 70 ? 'medium' : 'low',
      confidence,
      impact: 'Outgoing movement during the period depends on a single destination.',
      impactUsd: topDestination.amountUsd,
      relatedEntities: [topDestination.displayName],
      evidence: compactEvidence({
        counterparty: topDestination.displayName,
        outbound_share_pct: topDestination.sharePct,
        amount_usd: topDestination.amountUsd,
        interaction_count: topDestination.count,
        period: periodLabel,
      }),
    });
  }

  const topSource = metrics.topSources[0];
  if (topSource && topSource.sharePct >= 40) {
    insights.push({
      id: makeInsightId('flow', 'concentrated_source', topSource.counterparty || topSource.displayName),
      type: 'concentrated_inflow_source',
      category: 'flow',
      title: `${formatPct(topSource.sharePct)} of incoming value came from one counterparty`,
      description: `Incoming movement over ${periodLabel} is concentrated in ${topSource.displayName}, which sent ${formatUsd(topSource.amountUsd)} across ${topSource.count} movement(s).`,
      severity: topSource.sharePct >= 70 ? 'medium' : 'low',
      confidence,
      impact: 'Incoming movement during the period depends on a single source.',
      impactUsd: topSource.amountUsd,
      relatedEntities: [topSource.displayName],
      evidence: compactEvidence({
        counterparty: topSource.displayName,
        inbound_share_pct: topSource.sharePct,
        amount_usd: topSource.amountUsd,
        interaction_count: topSource.count,
        period: periodLabel,
      }),
    });
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  return insights;
}

function insightFromPattern(pattern: Pattern, metrics: FlowMetrics, periodLabel: string): Insight {
  const base = {
    id: makeInsightId('flow', pattern.type),
    type: pattern.type,
    category: 'flow' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence as Evidence,
  };

  switch (pattern.type) {
    case 'capital_accumulation':
      return {
        ...base,
        title: 'Capital entered the wallet consistently during the period',
        description: `Incoming movement of ${formatUsd(metrics.totalInflowUsd)} exceeded outgoing movement of ${formatUsd(metrics.totalOutflowUsd)} over ${periodLabel}. Part of any increase in wallet value is supported by these inflows rather than price movement.`,
        severity: 'informational',
        impactUsd: Math.abs(metrics.netFlowUsd),
      };
    case 'distribution':
      return {
        ...base,
        title: 'Capital leaving the wallet increased during the period',
        description: `Outgoing movement of ${formatUsd(metrics.totalOutflowUsd)} exceeded incoming movement of ${formatUsd(metrics.totalInflowUsd)} over ${periodLabel}. The available data records the movement only and does not show what happened after the transfer.`,
        severity: 'low',
        impactUsd: Math.abs(metrics.netFlowUsd),
      };
    case 'growth_without_inflows':
      return {
        ...base,
        title: 'Value change is not explained by capital movement',
        description: `Net capital movement over ${periodLabel} was ${formatUsd(metrics.netFlowUsd)}, negligible against portfolio value, so changes in total value over the window come from asset prices rather than transfers.`,
        severity: 'informational',
        impactUsd: Math.abs(metrics.netFlowUsd),
      };
    case 'large_capital_event':
      return {
        ...base,
        title: 'An unusually large capital movement was recorded',
        description: `A single movement of ${formatUsd(Number(pattern.evidence.amount_usd ?? 0))} was recorded, around ${pattern.evidence.multiple_of_average}× the wallet's historical average transfer size. The counterparty classification describes the address only.`,
        severity: 'medium',
        impact: 'A single event accounts for a large share of movement during the period.',
        impactUsd: Number(pattern.evidence.amount_usd ?? 0),
      };
    case 'flow_behavior_change':
      return {
        ...base,
        title: 'Capital movement behaviour changed compared with the previous period',
        description: `Average movement size moved from ${formatUsd(metrics.averageFlow.previous)} to ${formatUsd(metrics.averageFlow.current)} between the two windows.`,
        severity: 'medium',
        impactUsd: Math.abs(metrics.averageFlow.current - metrics.averageFlow.previous),
      };
    default:
      return {
        ...base,
        title: 'Activity resumed after an extended quiet period',
        description: `No transfers were recorded for ${formatDaysValue(pattern.evidence.inactive_days_before_period)} before this window, and ${metrics.flowCount} movement(s) were recorded during it.`,
        severity: 'medium',
        impactUsd: round2(metrics.totalInflowUsd + metrics.totalOutflowUsd),
      };
  }
}

function formatDaysValue(value: string | number | undefined): string {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(num) ? `${Math.round(num)} days` : 'an extended period';
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.26)
// ---------------------------------------------------------------------------

function buildSummary(metrics: FlowMetrics, period: ResolvedPeriod): string {
  if (metrics.flowCount === 0) {
    return `No priced incoming or outgoing transfers were recorded over the last ${period.days} days.`;
  }

  const parts: string[] = [];
  parts.push(
    `Over the last ${period.days} days, ${SUMMARY_INFLOW.toLowerCase()} totalled ${formatUsd(metrics.totalInflowUsd)} and ${SUMMARY_OUTFLOW.toLowerCase()} totalled ${formatUsd(metrics.totalOutflowUsd)}, leaving a net movement of ${formatUsd(metrics.netFlowUsd)} across ${metrics.flowCount} transfer(s).`,
  );

  const topSource = metrics.topSources[0];
  if (topSource) {
    parts.push(
      `The largest source was ${topSource.displayName} at ${formatUsd(topSource.amountUsd)} (${formatPct(topSource.sharePct)} of incoming value).`,
    );
  }
  const topDestination = metrics.topDestinations[0];
  if (topDestination) {
    parts.push(
      `The largest destination was ${topDestination.displayName} at ${formatUsd(topDestination.amountUsd)} (${formatPct(topDestination.sharePct)} of outgoing value).`,
    );
  }

  parts.push(
    `Average movement size was ${formatUsd(metrics.averageFlowUsd)} across ${metrics.activeDays} active day(s).`,
  );

  return parts.join(' ');
}

/** Total value moved in either direction over the window. */
export function movedVolumeUsd(metrics: FlowMetrics): number {
  return round2(metrics.totalInflowUsd + metrics.totalOutflowUsd);
}

/** Period-over-period change in movement count, for behaviour comparisons. */
export function flowCountChangePct(current: FlowMetrics, previousCount: number): number | null {
  return pctChange(current.flowCount, previousCount);
}
