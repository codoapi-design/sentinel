/**
 * Module 08 — Counterparty Intelligence (Spec §5.116–§5.133).
 *
 * Turns raw addresses into described relationships: who the wallet interacts
 * with, how often, how much moves, and how established the relationship is.
 *
 * Two rules govern every line of output (Spec §5.117, §5.127):
 * - An address is never attributed to a person. "Personal Wallet" is a
 *   technical description of the address type, not an identity.
 * - `Exchange interaction ≠ Selling` and `Unknown = Missing data`, never
 *   "suspicious".
 */

import { getProtocolInfo } from '@/lib/alchemy/classifier';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import {
  buildDataQuality,
  clamp,
  compactEvidence,
  daysBetween,
  deriveConfidence,
  formatDays,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  isoDay,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  normalizeAddress,
  ownedAddressSet,
  resolvePeriod,
  resolveTransactions,
  round1,
  round2,
  score100,
  sharePct,
  splitByPeriod,
  stdDev,
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
  Insight,
  IntelligenceInput,
  IntelligenceResult,
  IntelligenceTransaction,
  Pattern,
} from './types';

/** Six address types (Spec §5.120). Describes the address, never a person. */
export type CounterpartyType =
  | 'exchange'
  | 'defi_protocol'
  | 'bridge'
  | 'personal_wallet'
  | 'internal_wallet'
  | 'unknown';

export interface RelationshipScore {
  /** 0–100. Higher = stronger, more established — never "better" (Spec §5.122). */
  total: number;
  components: {
    frequency: number;
    volume: number;
    recency: number;
    consistency: number;
  };
  weights: {
    frequency: 30;
    volume: 30;
    recency: 20;
    consistency: 20;
  };
}

export interface CounterpartyProfile {
  /** Normalised address, or a synthetic key when the address is missing. */
  key: string;
  address: string | null;
  /** Custom client name → counterparty label → shortened address. */
  displayName: string;
  type: CounterpartyType;
  /** Why the type was assigned — kept so the classification stays auditable. */
  typeSignals: string[];
  interactionCount: number;
  inboundCount: number;
  outboundCount: number;
  totalVolumeUsd: number;
  inboundVolumeUsd: number;
  outboundVolumeUsd: number;
  avgTransferSizeUsd: number;
  largestTransferUsd: number;
  firstSeen: string | null;
  lastSeen: string | null;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  relationshipDurationDays: number | null;
  daysSinceLastInteraction: number | null;
  /** Share of total wallet movement, 0–100 (Spec §5.121 Dominance). */
  dominancePct: number;
  inboundDominancePct: number;
  outboundDominancePct: number;
  networks: string[];
  relationshipScore: RelationshipScore;
  /** Interactions recorded before the current window. */
  previousInteractionCount: number;
  isNew: boolean;
  confidence: Confidence;
}

export interface CounterpartyTypeBreakdown {
  type: CounterpartyType;
  count: number;
  interactionCount: number;
  volumeUsd: number;
  volumeSharePct: number;
}

export interface CounterpartyMetrics {
  periodDays: number;
  counterparties: CounterpartyProfile[];
  counterpartyCount: number;
  newCounterpartyCount: number;
  totalVolumeUsd: number;
  totalInboundUsd: number;
  totalOutboundUsd: number;
  totalInteractions: number;
  topByVolume: CounterpartyProfile[];
  topSources: CounterpartyProfile[];
  topDestinations: CounterpartyProfile[];
  strongestRelationship: CounterpartyProfile | null;
  byType: CounterpartyTypeBreakdown[];
  /** Share of movement with addresses that could not be classified. */
  unknownVolumeSharePct: number;
  exchangeVolumeSharePct: number;
  internalVolumeSharePct: number;
  /** Highest single-counterparty dominance, 0–100. */
  maxDominancePct: number;
  concentrationLevel: 'concentrated' | 'moderate' | 'distributed';
}

export type CounterpartyIntelligence = IntelligenceResult<CounterpartyMetrics>;

const DOMINANCE_THRESHOLD_PCT = 50;
const NEW_COUNTERPARTY_SHARE_PCT = 20;
const UNKNOWN_HIGH_VALUE_MULTIPLE = 3;
const DECAY_MIN_PREVIOUS_INTERACTIONS = 3;
const EXCHANGE_INCREASE_FACTOR = 1.5;
const CONCENTRATED_PCT = 60;
const DISTRIBUTED_PCT = 30;

const SCORE_WEIGHTS = {
  frequency: 30,
  volume: 30,
  recency: 20,
  consistency: 20,
} as const;

const EXCHANGE_HINTS = [
  'binance', 'coinbase', 'kraken', 'okx', 'bybit', 'kucoin', 'bitfinex', 'gate.io', 'gemini',
  'bitstamp', 'crypto.com', 'huobi', 'mexc', 'bitget', 'upbit', 'exchange', 'cex',
];
const BRIDGE_HINTS = [
  'bridge', 'hop protocol', 'across', 'stargate', 'wormhole', 'synapse', 'connext', 'celer',
  'axelar', 'layerzero', 'orbiter',
];
const DEFI_HINTS = [
  'uniswap', 'sushiswap', 'curve', 'aave', 'compound', 'balancer', 'pancakeswap', '1inch',
  'paraswap', 'lido', 'rocket pool', 'gmx', 'pendle', 'maker', 'yearn', 'convex', 'protocol',
  'router', 'vault', 'pool', 'swap', 'staking',
];

interface CounterpartyAccumulator {
  key: string;
  address: string | null;
  label: string | null;
  displayName: string;
  inboundCount: number;
  outboundCount: number;
  interactionCount: number;
  inboundVolumeUsd: number;
  outboundVolumeUsd: number;
  largestTransferUsd: number;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  timestamps: number[];
  networks: Set<string>;
  types: Set<string>;
  protocols: Set<string>;
  contractLike: boolean;
  internal: boolean;
  previousInteractionCount: number;
}

export function analyzeCounterparties(input: IntelligenceInput): CounterpartyIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const owned = ownedAddressSet(input);
  const clients = input.clients ?? [];

  const split = splitByPeriod(txs, txTimestampMs, period);
  const accumulators = new Map<string, CounterpartyAccumulator>();

  for (const tx of split.current) {
    accumulate(accumulators, tx, owned, clients, false);
  }
  for (const tx of [...split.previous, ...split.older]) {
    accumulate(accumulators, tx, owned, clients, true);
  }

  const currentAccumulators = [...accumulators.values()].filter(a => a.interactionCount > 0);
  const totalVolumeUsd = round2(
    sum(currentAccumulators.map(a => a.inboundVolumeUsd + a.outboundVolumeUsd)),
  );
  const totalInboundUsd = round2(sum(currentAccumulators.map(a => a.inboundVolumeUsd)));
  const totalOutboundUsd = round2(sum(currentAccumulators.map(a => a.outboundVolumeUsd)));
  const totalInteractions = sum(currentAccumulators.map(a => a.interactionCount));
  const maxInteractionCount = Math.max(1, ...currentAccumulators.map(a => a.interactionCount));

  const counterparties = currentAccumulators
    .map(acc =>
      buildProfile(acc, {
        period,
        totalVolumeUsd,
        totalInboundUsd,
        totalOutboundUsd,
        maxInteractionCount,
      }),
    )
    .sort((a, b) =>
      b.totalVolumeUsd === a.totalVolumeUsd
        ? b.interactionCount === a.interactionCount
          ? a.key.localeCompare(b.key)
          : b.interactionCount - a.interactionCount
        : b.totalVolumeUsd - a.totalVolumeUsd,
    );

  const byType = buildTypeBreakdown(counterparties, totalVolumeUsd);
  const maxDominancePct = counterparties[0]?.dominancePct ?? 0;

  const metrics: CounterpartyMetrics = {
    periodDays: period.days,
    counterparties,
    counterpartyCount: counterparties.length,
    newCounterpartyCount: counterparties.filter(c => c.isNew).length,
    totalVolumeUsd,
    totalInboundUsd,
    totalOutboundUsd,
    totalInteractions,
    topByVolume: topN(counterparties, 5, c => c.totalVolumeUsd),
    topSources: topN(
      counterparties.filter(c => c.inboundVolumeUsd > 0),
      5,
      c => c.inboundVolumeUsd,
    ),
    topDestinations: topN(
      counterparties.filter(c => c.outboundVolumeUsd > 0),
      5,
      c => c.outboundVolumeUsd,
    ),
    strongestRelationship: topN(counterparties, 1, c => c.relationshipScore.total)[0] ?? null,
    byType,
    unknownVolumeSharePct: typeShare(byType, 'unknown'),
    exchangeVolumeSharePct: typeShare(byType, 'exchange'),
    internalVolumeSharePct: typeShare(byType, 'internal_wallet'),
    maxDominancePct,
    concentrationLevel:
      maxDominancePct >= CONCENTRATED_PCT
        ? 'concentrated'
        : maxDominancePct >= DISTRIBUTED_PCT
          ? 'moderate'
          : 'distributed',
  };

  const confidence = lowestConfidence(
    deriveConfidence(dataQuality, { minSampleForHigh: 15, minSampleForMedium: 4 }),
    counterparties.length === 0 ? 'low' : 'high',
    metrics.unknownVolumeSharePct >= 50 ? 'low' : metrics.unknownVolumeSharePct >= 20 ? 'medium' : 'high',
  );

  const patterns = detectPatterns(metrics, accumulators, period, confidence);
  const insights = buildInsights(metrics, patterns, period);

  return {
    summary: buildSummary(metrics, period),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: formatPeriodLabel(period.days),
      counterparty_count: metrics.counterpartyCount,
      new_counterparty_count: metrics.newCounterpartyCount,
      total_volume_usd: metrics.totalVolumeUsd,
      total_interactions: metrics.totalInteractions,
      top_counterparty: metrics.topByVolume[0]?.displayName,
      top_counterparty_dominance_pct: metrics.maxDominancePct,
      unknown_volume_share_pct: metrics.unknownVolumeSharePct,
      exchange_volume_share_pct: metrics.exchangeVolumeSharePct,
      concentration_level: metrics.concentrationLevel,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Accumulation
// ---------------------------------------------------------------------------

function accumulate(
  map: Map<string, CounterpartyAccumulator>,
  tx: IntelligenceTransaction,
  owned: Set<string>,
  clients: IntelligenceInput['clients'],
  historical: boolean,
): void {
  const address = normalizeAddress(tx.counterparty ?? tx.to ?? tx.to_addr ?? tx.from);
  const label = (tx.counterpartyLabel ?? tx.counterparty_label ?? '').toString().trim() || null;
  const displayName = resolveCounterpartyDisplay(
    { counterparty: tx.counterparty, counterpartyLabel: tx.counterpartyLabel },
    clients ?? [],
  );
  const key = address || (label ? `label:${label.toLowerCase()}` : 'unidentified');

  let acc = map.get(key);
  if (!acc) {
    acc = {
      key,
      address: address || null,
      label,
      displayName: displayName || label || shortAddress(address),
      inboundCount: 0,
      outboundCount: 0,
      interactionCount: 0,
      inboundVolumeUsd: 0,
      outboundVolumeUsd: 0,
      largestTransferUsd: 0,
      firstSeenMs: null,
      lastSeenMs: null,
      timestamps: [],
      networks: new Set<string>(),
      types: new Set<string>(),
      protocols: new Set<string>(),
      contractLike: false,
      internal: false,
      previousInteractionCount: 0,
    };
    map.set(key, acc);
  }

  const ms = txTimestampMs(tx);
  if (ms != null) {
    if (acc.firstSeenMs == null || ms < acc.firstSeenMs) acc.firstSeenMs = ms;
    if (acc.lastSeenMs == null || ms > acc.lastSeenMs) acc.lastSeenMs = ms;
  }

  if (!acc.label && label) acc.label = label;
  if (label && (!acc.displayName || acc.displayName === shortAddress(address))) {
    acc.displayName = displayName || label;
  }
  if (isInternalAddress(address, owned)) acc.internal = true;

  const type = txType(tx);
  acc.types.add(type);
  acc.networks.add(txNetwork(tx));
  const protocol = (tx.protocol ?? '').toString().trim().toLowerCase();
  if (protocol) {
    acc.protocols.add(protocol);
    acc.contractLike = true;
  }
  if (type === 'trade' || type === 'defi' || type === 'bridge' || type === 'staking') {
    acc.contractLike = true;
  }
  if (tx.methodId ?? tx.method_id) acc.contractLike = true;

  if (historical) {
    acc.previousInteractionCount += 1;
    return;
  }

  acc.interactionCount += 1;
  if (ms != null) acc.timestamps.push(ms);

  const usd = txUsd(tx) ?? 0;
  const direction = txDirection(tx);
  if (direction === 'in') {
    acc.inboundCount += 1;
    acc.inboundVolumeUsd += usd;
  } else if (direction === 'out') {
    acc.outboundCount += 1;
    acc.outboundVolumeUsd += usd;
  }
  // Non-directional rows (swaps, contract calls) still count as interactions
  // but contribute to neither inbound nor outbound value.
  if (usd > acc.largestTransferUsd) acc.largestTransferUsd = usd;
}

function isInternalAddress(address: string, owned: Set<string>): boolean {
  return address.length > 0 && owned.has(address);
}

function shortAddress(address: string): string {
  if (!address) return 'Unidentified address';
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

// ---------------------------------------------------------------------------
// Profiles, classification (Spec §5.120) and relationship score (Spec §5.122)
// ---------------------------------------------------------------------------

interface ProfileContext {
  period: ResolvedPeriod;
  totalVolumeUsd: number;
  totalInboundUsd: number;
  totalOutboundUsd: number;
  maxInteractionCount: number;
}

function buildProfile(acc: CounterpartyAccumulator, ctx: ProfileContext): CounterpartyProfile {
  const totalVolumeUsd = round2(acc.inboundVolumeUsd + acc.outboundVolumeUsd);
  const classification = classifyCounterparty(acc);
  const relationshipDurationDays =
    acc.firstSeenMs != null && acc.lastSeenMs != null
      ? round1(daysBetween(acc.firstSeenMs, acc.lastSeenMs))
      : null;
  const daysSinceLastInteraction =
    acc.lastSeenMs != null ? round1(daysBetween(acc.lastSeenMs, ctx.period.now)) : null;

  const relationshipScore = computeRelationshipScore(acc, {
    totalVolumeUsd: ctx.totalVolumeUsd,
    maxInteractionCount: ctx.maxInteractionCount,
    periodDays: ctx.period.days,
    daysSinceLastInteraction,
  });

  return {
    key: acc.key,
    address: acc.address,
    displayName: acc.displayName || shortAddress(acc.address ?? ''),
    type: classification.type,
    typeSignals: classification.signals,
    interactionCount: acc.interactionCount,
    inboundCount: acc.inboundCount,
    outboundCount: acc.outboundCount,
    totalVolumeUsd,
    inboundVolumeUsd: round2(acc.inboundVolumeUsd),
    outboundVolumeUsd: round2(acc.outboundVolumeUsd),
    avgTransferSizeUsd: acc.interactionCount > 0 ? round2(totalVolumeUsd / acc.interactionCount) : 0,
    largestTransferUsd: round2(acc.largestTransferUsd),
    firstSeen: acc.firstSeenMs != null ? isoDay(acc.firstSeenMs) : null,
    lastSeen: acc.lastSeenMs != null ? isoDay(acc.lastSeenMs) : null,
    firstSeenMs: acc.firstSeenMs,
    lastSeenMs: acc.lastSeenMs,
    relationshipDurationDays,
    daysSinceLastInteraction,
    dominancePct: sharePct(totalVolumeUsd, ctx.totalVolumeUsd),
    inboundDominancePct: sharePct(acc.inboundVolumeUsd, ctx.totalInboundUsd),
    outboundDominancePct: sharePct(acc.outboundVolumeUsd, ctx.totalOutboundUsd),
    networks: [...acc.networks].sort(),
    relationshipScore,
    previousInteractionCount: acc.previousInteractionCount,
    isNew:
      acc.previousInteractionCount === 0 &&
      acc.firstSeenMs != null &&
      acc.firstSeenMs >= ctx.period.currentStart,
    confidence:
      classification.type === 'unknown' ? 'low' : acc.interactionCount >= 3 ? 'high' : 'medium',
  };
}

/**
 * Classification uses the labels, protocol registry, and method hints already
 * present in the data. `unknown` means missing data, never "suspicious"
 * (Spec §5.120 Type 6).
 */
function classifyCounterparty(acc: CounterpartyAccumulator): {
  type: CounterpartyType;
  signals: string[];
} {
  const signals: string[] = [];

  if (acc.internal) {
    signals.push('address_in_user_wallets');
    return { type: 'internal_wallet', signals };
  }

  const haystack = [acc.label ?? '', acc.displayName, ...acc.protocols].join(' ').toLowerCase();

  if (acc.address) {
    const protocolInfo = getProtocolInfo(acc.address);
    if (protocolInfo) {
      signals.push(`protocol_registry_${protocolInfo.name.toLowerCase()}`);
      return {
        type: protocolInfo.type === 'bridge' ? 'bridge' : 'defi_protocol',
        signals,
      };
    }
  }

  if (matches(haystack, BRIDGE_HINTS)) {
    signals.push('bridge_label_match');
    return { type: 'bridge', signals };
  }
  if (acc.types.has('bridge')) {
    signals.push('bridge_transaction_type');
    return { type: 'bridge', signals };
  }
  if (matches(haystack, EXCHANGE_HINTS)) {
    signals.push('exchange_label_match');
    return { type: 'exchange', signals };
  }
  if (matches(haystack, DEFI_HINTS) || acc.protocols.size > 0) {
    signals.push('protocol_label_match');
    return { type: 'defi_protocol', signals };
  }
  if (acc.contractLike) {
    signals.push('contract_level_interaction');
    return { type: 'defi_protocol', signals };
  }
  if (acc.address && acc.address.startsWith('0x') && acc.address.length >= 40) {
    signals.push('non_contract_address', 'no_registry_match');
    return { type: 'personal_wallet', signals };
  }

  signals.push('no_classification_data');
  return { type: 'unknown', signals };
}

function matches(value: string, hints: string[]): boolean {
  return hints.some(hint => value.includes(hint));
}

interface ScoreContext {
  totalVolumeUsd: number;
  maxInteractionCount: number;
  periodDays: number;
  daysSinceLastInteraction: number | null;
}

function computeRelationshipScore(
  acc: CounterpartyAccumulator,
  ctx: ScoreContext,
): RelationshipScore {
  // Frequency — interactions relative to the busiest relationship.
  const frequency = clamp(
    (acc.interactionCount / Math.max(1, ctx.maxInteractionCount)) * SCORE_WEIGHTS.frequency,
    0,
    SCORE_WEIGHTS.frequency,
  );

  // Volume — share of all value moved with any counterparty.
  const volumeShare =
    ctx.totalVolumeUsd > 0
      ? (acc.inboundVolumeUsd + acc.outboundVolumeUsd) / ctx.totalVolumeUsd
      : 0;
  const volume = clamp(volumeShare * SCORE_WEIGHTS.volume, 0, SCORE_WEIGHTS.volume);

  // Recency — how close the last interaction is to now.
  const recency =
    ctx.daysSinceLastInteraction == null
      ? 0
      : clamp(
          (1 - ctx.daysSinceLastInteraction / Math.max(1, ctx.periodDays)) * SCORE_WEIGHTS.recency,
          0,
          SCORE_WEIGHTS.recency,
        );

  // Consistency — regular spacing scores higher than a single burst.
  const consistency = clamp(
    computeConsistency(acc.timestamps) * SCORE_WEIGHTS.consistency,
    0,
    SCORE_WEIGHTS.consistency,
  );

  return {
    total: score100(frequency + volume + recency + consistency),
    components: {
      frequency: round1(frequency),
      volume: round1(volume),
      recency: round1(recency),
      consistency: round1(consistency),
    },
    weights: SCORE_WEIGHTS,
  };
}

/** 0–1 regularity of interaction spacing; a single interaction scores 0. */
function computeConsistency(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  }
  const average = sum(gaps) / gaps.length;
  if (average <= 0) return 0.5;
  const variation = stdDev(gaps) / average;
  return clamp(1 - variation / 2, 0, 1);
}

function buildTypeBreakdown(
  counterparties: CounterpartyProfile[],
  totalVolumeUsd: number,
): CounterpartyTypeBreakdown[] {
  const types: CounterpartyType[] = [
    'exchange',
    'defi_protocol',
    'bridge',
    'personal_wallet',
    'internal_wallet',
    'unknown',
  ];
  return types
    .map(type => {
      const group = counterparties.filter(c => c.type === type);
      const volumeUsd = round2(sum(group.map(c => c.totalVolumeUsd)));
      return {
        type,
        count: group.length,
        interactionCount: sum(group.map(c => c.interactionCount)),
        volumeUsd,
        volumeSharePct: sharePct(volumeUsd, totalVolumeUsd),
      };
    })
    .filter(entry => entry.count > 0);
}

function typeShare(breakdown: CounterpartyTypeBreakdown[], type: CounterpartyType): number {
  return breakdown.find(entry => entry.type === type)?.volumeSharePct ?? 0;
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.123)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: CounterpartyMetrics,
  accumulators: Map<string, CounterpartyAccumulator>,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — New Important Counterparty
  const newImportant = topN(
    metrics.counterparties.filter(c => c.isNew && c.dominancePct >= NEW_COUNTERPARTY_SHARE_PCT),
    1,
    c => c.totalVolumeUsd,
  )[0];
  if (newImportant) {
    patterns.push({
      id: makePatternId('counterparty', 'new_important_counterparty', newImportant.key),
      type: 'new_important_counterparty',
      name: 'New Important Counterparty',
      description:
        'A new counterparty appeared and immediately accounts for a significant share of movement.',
      category: 'counterparty',
      confidence,
      evidence: compactEvidence({
        counterparty: newImportant.displayName,
        counterparty_type: newImportant.type,
        first_seen: newImportant.firstSeen,
        interaction_count: newImportant.interactionCount,
        volume_usd: newImportant.totalVolumeUsd,
        dominance_pct: newImportant.dominancePct,
        period: periodLabel,
      }),
    });
  }

  // Pattern 2 — Frequent Exchange Interaction
  const exchangeCurrent = metrics.counterparties.filter(c => c.type === 'exchange');
  const exchangeInteractions = sum(exchangeCurrent.map(c => c.interactionCount));
  const exchangeBaseline = sum(
    [...accumulators.values()]
      .filter(acc => exchangeCurrent.some(c => c.key === acc.key))
      .map(acc => acc.previousInteractionCount),
  );
  if (
    exchangeInteractions > 0 &&
    exchangeBaseline > 0 &&
    exchangeInteractions > exchangeBaseline * EXCHANGE_INCREASE_FACTOR
  ) {
    patterns.push({
      id: makePatternId('counterparty', 'frequent_exchange_interaction'),
      type: 'frequent_exchange_interaction',
      name: 'Frequent Exchange Interaction',
      description:
        'Interactions with exchange addresses increased compared with the historical baseline.',
      category: 'counterparty',
      confidence,
      evidence: compactEvidence({
        exchange_interaction_count: exchangeInteractions,
        baseline_interaction_count: exchangeBaseline,
        exchange_volume_share_pct: metrics.exchangeVolumeSharePct,
        exchange_counterparty_count: exchangeCurrent.length,
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Major Capital Destination
  const destination = metrics.topDestinations[0];
  if (destination && destination.outboundDominancePct >= DOMINANCE_THRESHOLD_PCT) {
    patterns.push({
      id: makePatternId('counterparty', 'major_capital_destination', destination.key),
      type: 'major_capital_destination',
      name: 'Major Capital Destination',
      description: 'A large share of outgoing value goes to a single counterparty.',
      category: 'counterparty',
      confidence,
      evidence: compactEvidence({
        counterparty: destination.displayName,
        counterparty_type: destination.type,
        outbound_volume_usd: destination.outboundVolumeUsd,
        outbound_dominance_pct: destination.outboundDominancePct,
        interaction_count: destination.outboundCount,
        total_outbound_usd: metrics.totalOutboundUsd,
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Major Capital Source
  const source = metrics.topSources[0];
  if (source && source.inboundDominancePct >= DOMINANCE_THRESHOLD_PCT) {
    patterns.push({
      id: makePatternId('counterparty', 'major_capital_source', source.key),
      type: 'major_capital_source',
      name: 'Major Capital Source',
      description: 'A large share of incoming value comes from a single counterparty.',
      category: 'counterparty',
      confidence,
      evidence: compactEvidence({
        counterparty: source.displayName,
        counterparty_type: source.type,
        inbound_volume_usd: source.inboundVolumeUsd,
        inbound_dominance_pct: source.inboundDominancePct,
        interaction_count: source.inboundCount,
        total_inbound_usd: metrics.totalInboundUsd,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — Relationship Decay
  const decayed = topN(
    [...accumulators.values()].filter(
      acc =>
        acc.interactionCount === 0 &&
        acc.previousInteractionCount >= DECAY_MIN_PREVIOUS_INTERACTIONS,
    ),
    1,
    acc => acc.previousInteractionCount,
  )[0];
  if (decayed) {
    patterns.push({
      id: makePatternId('counterparty', 'relationship_decay', decayed.key),
      type: 'relationship_decay',
      name: 'Relationship Decay',
      description: 'A previously recurring relationship shows no recent activity.',
      category: 'counterparty',
      confidence,
      evidence: compactEvidence({
        counterparty: decayed.displayName,
        previous_interaction_count: decayed.previousInteractionCount,
        current_interaction_count: 0,
        last_seen: decayed.lastSeenMs != null ? isoDay(decayed.lastSeenMs) : undefined,
        days_since_last_interaction:
          decayed.lastSeenMs != null ? round1(daysBetween(decayed.lastSeenMs, period.now)) : undefined,
        period: periodLabel,
      }),
    });
  }

  // Pattern 6 — Unknown High-Value Interaction
  const avgTransfer =
    metrics.totalInteractions > 0 ? metrics.totalVolumeUsd / metrics.totalInteractions : 0;
  const unknownHighValue = topN(
    metrics.counterparties.filter(
      c =>
        c.type === 'unknown' &&
        avgTransfer > 0 &&
        c.largestTransferUsd >= avgTransfer * UNKNOWN_HIGH_VALUE_MULTIPLE,
    ),
    1,
    c => c.largestTransferUsd,
  )[0];
  if (unknownHighValue) {
    patterns.push({
      id: makePatternId('counterparty', 'unknown_high_value_interaction', unknownHighValue.key),
      type: 'unknown_high_value_interaction',
      name: 'Unknown High-Value Interaction',
      description:
        'A high-value interaction occurred with an address that could not be classified.',
      category: 'counterparty',
      confidence: 'low',
      evidence: compactEvidence({
        counterparty: unknownHighValue.displayName,
        largest_transfer_usd: unknownHighValue.largestTransferUsd,
        average_transfer_usd: round2(avgTransfer),
        interaction_count: unknownHighValue.interactionCount,
        volume_usd: unknownHighValue.totalVolumeUsd,
        period: periodLabel,
      }),
    });
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.126, interpretation rules §5.127)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: CounterpartyMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  if (metrics.counterpartyCount === 0) {
    insights.push({
      id: makeInsightId('counterparty', 'no_counterparties'),
      type: 'no_counterparties',
      category: 'counterparty',
      title: 'No counterparty interactions were recorded',
      description: `No transfers with an identifiable counterparty were found in the last ${period.days} days.`,
      severity: 'informational',
      confidence: 'low',
      impactUsd: null,
      evidence: compactEvidence({ counterparty_count: 0, period: periodLabel }),
    });
    return insights;
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  const strongest = metrics.strongestRelationship;
  if (strongest && strongest.relationshipScore.total >= 60 && !patterns.some(p => p.evidence.counterparty === strongest.displayName)) {
    insights.push({
      id: makeInsightId('counterparty', 'established_relationship', strongest.key),
      type: 'established_relationship',
      category: 'counterparty',
      title: `${strongest.displayName} is the most established relationship`,
      description: `${strongest.displayName} shows ${strongest.interactionCount} interactions carrying ${formatUsd(strongest.totalVolumeUsd)}, ${formatPct(strongest.dominancePct)} of all movement over ${periodLabel}. The relationship score of ${strongest.relationshipScore.total} describes how established the interaction pattern is, not its quality.`,
      severity: 'informational',
      confidence: strongest.confidence,
      impactUsd: strongest.totalVolumeUsd,
      relatedEntities: [strongest.displayName],
      evidence: compactEvidence({
        counterparty: strongest.displayName,
        counterparty_type: strongest.type,
        relationship_score: strongest.relationshipScore.total,
        interaction_count: strongest.interactionCount,
        volume_usd: strongest.totalVolumeUsd,
        dominance_pct: strongest.dominancePct,
        first_seen: strongest.firstSeen,
        last_seen: strongest.lastSeen,
        relationship_duration_days: strongest.relationshipDurationDays,
      }),
    });
  }

  if (metrics.unknownVolumeSharePct >= 20) {
    insights.push({
      id: makeInsightId('counterparty', 'unclassified_counterparties'),
      type: 'unclassified_counterparties',
      category: 'counterparty',
      title: `${formatPct(metrics.unknownVolumeSharePct)} of movement is with unclassified addresses`,
      description: `Part of the recorded movement involves addresses with no label or registry match in the available data. This is a data limitation that lowers analysis confidence; it is not a security assessment of those addresses.`,
      severity: 'low',
      confidence: 'low',
      impact: 'Part of the relationship map cannot be described.',
      impactUsd: round2((metrics.totalVolumeUsd * metrics.unknownVolumeSharePct) / 100),
      evidence: compactEvidence({
        unknown_volume_share_pct: metrics.unknownVolumeSharePct,
        unknown_counterparty_count:
          metrics.byType.find(t => t.type === 'unknown')?.count ?? 0,
        total_volume_usd: metrics.totalVolumeUsd,
      }),
    });
  }

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: CounterpartyMetrics,
  periodLabel: string,
): Insight {
  const name = typeof pattern.evidence.counterparty === 'string' ? pattern.evidence.counterparty : null;
  const base = {
    id: makeInsightId('counterparty', pattern.type, name),
    type: pattern.type,
    category: 'counterparty' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
    relatedEntities: name ? [name] : undefined,
  };

  switch (pattern.type) {
    case 'new_important_counterparty':
      return {
        ...base,
        title: `${name} appeared and already carries ${formatPct(Number(pattern.evidence.dominance_pct ?? 0))} of movement`,
        description: `${name} was first recorded during ${periodLabel} and accounts for ${formatUsd(Number(pattern.evidence.volume_usd ?? 0))} across ${Number(pattern.evidence.interaction_count ?? 0)} interaction(s). This describes a change in the relationship map, not a judgement about the counterparty.`,
        severity: 'low',
        impact: 'The distribution of movement changed during the period.',
        impactUsd: Number(pattern.evidence.volume_usd ?? 0),
      };
    case 'frequent_exchange_interaction':
      return {
        ...base,
        title: 'Interactions with exchange addresses increased',
        description: `${Number(pattern.evidence.exchange_interaction_count ?? 0)} interactions with exchange addresses were recorded over ${periodLabel} against ${Number(pattern.evidence.baseline_interaction_count ?? 0)} in the earlier history. Movement to or from an exchange address is not evidence of buying or selling.`,
        severity: 'low',
        impact: 'A larger share of movement passes through exchange addresses.',
        impactUsd: round2(
          (metrics.totalVolumeUsd * Number(pattern.evidence.exchange_volume_share_pct ?? 0)) / 100,
        ),
      };
    case 'major_capital_destination':
      return {
        ...base,
        title: `${formatPct(Number(pattern.evidence.outbound_dominance_pct ?? 0))} of outgoing value goes to ${name}`,
        description: `${formatUsd(Number(pattern.evidence.outbound_volume_usd ?? 0))} of ${formatUsd(metrics.totalOutboundUsd)} in outgoing value moved to ${name} over ${periodLabel}. Outgoing movement is concentrated in one destination.`,
        severity: 'medium',
        impact: 'Outgoing movement depends on a single destination.',
        impactUsd: Number(pattern.evidence.outbound_volume_usd ?? 0),
      };
    case 'major_capital_source':
      return {
        ...base,
        title: `${formatPct(Number(pattern.evidence.inbound_dominance_pct ?? 0))} of incoming value comes from ${name}`,
        description: `${formatUsd(Number(pattern.evidence.inbound_volume_usd ?? 0))} of ${formatUsd(metrics.totalInboundUsd)} in incoming value came from ${name} over ${periodLabel}. Incoming movement depends on one source.`,
        severity: 'medium',
        impact: 'Incoming movement depends on a single source.',
        impactUsd: Number(pattern.evidence.inbound_volume_usd ?? 0),
      };
    case 'relationship_decay':
      return {
        ...base,
        title: `${name} shows no interactions during ${periodLabel}`,
        description: `${Number(pattern.evidence.previous_interaction_count ?? 0)} interactions with ${name} were recorded before this period and none within it. The data shows an absence of activity during the window; it does not show that the relationship ended.`,
        severity: 'informational',
        impactUsd: null,
      };
    default:
      return {
        ...base,
        title: `A high-value interaction occurred with an unclassified address`,
        description: `A single transfer of ${formatUsd(Number(pattern.evidence.largest_transfer_usd ?? 0))} involved an address with no label or registry match, against an average transfer of ${formatUsd(Number(pattern.evidence.average_transfer_usd ?? 0))}. This is reported as a data limitation and lowers analysis confidence; it is not a security judgement.`,
        severity: 'medium',
        impact: 'Part of the movement cannot be attributed to a described relationship.',
        impactUsd: Number(pattern.evidence.largest_transfer_usd ?? 0),
      };
  }
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.129)
// ---------------------------------------------------------------------------

function buildSummary(metrics: CounterpartyMetrics, period: ResolvedPeriod): string {
  if (metrics.counterpartyCount === 0) {
    return `No counterparty interactions were recorded in the last ${period.days} days.`;
  }

  const parts: string[] = [];
  parts.push(
    `${metrics.totalInteractions} interaction(s) with ${metrics.counterpartyCount} counterpart(ies) moved ${formatUsd(metrics.totalVolumeUsd)} over the last ${period.days} days.`,
  );

  const top = metrics.topByVolume[0];
  if (top) {
    parts.push(
      `${top.displayName} carries the largest share at ${formatPct(top.dominancePct)} of movement across ${top.interactionCount} interaction(s)${top.relationshipDurationDays != null && top.relationshipDurationDays > 0 ? ` over ${formatDays(top.relationshipDurationDays)}` : ''}.`,
    );
  }

  const typeParts = metrics.byType
    .filter(t => t.volumeSharePct > 0)
    .map(t => `${t.type.replace(/_/g, ' ')} ${formatPct(t.volumeSharePct)}`);
  if (typeParts.length > 0) {
    parts.push(`Movement by counterparty type: ${typeParts.join(', ')}.`);
  }

  if (metrics.newCounterpartyCount > 0) {
    parts.push(`${metrics.newCounterpartyCount} counterpart(ies) appeared for the first time during the window.`);
  }
  if (metrics.unknownVolumeSharePct > 0) {
    parts.push(
      `${formatPct(metrics.unknownVolumeSharePct)} of movement involves addresses that could not be classified, which is a data limitation rather than an assessment of those addresses.`,
    );
  }

  return parts.join(' ');
}

/** Counterparties ordered by relationship strength (Spec §5.125 Importance Ranking). */
export function rankCounterparties(
  metrics: CounterpartyMetrics,
  limit = 5,
): CounterpartyProfile[] {
  return topN(metrics.counterparties, limit, c => c.relationshipScore.total);
}
