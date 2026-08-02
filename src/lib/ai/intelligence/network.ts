/**
 * Module 07 — Network Intelligence (Spec §5.99–§5.115).
 *
 * A network is an operating environment, not just a location for an asset
 * (Spec §5.100). This module measures where value sits, where activity happens,
 * what that activity costs, and — most importantly — where the two diverge
 * (Spec §5.105 Pattern 4, Capital vs Activity Mismatch).
 *
 * The Network Health Score evaluates the wallet's *use* of networks, never the
 * networks themselves (Spec §5.104).
 */

import {
  buildAssetLedger,
  buildDataQuality,
  clamp,
  compactEvidence,
  daysBetween,
  deriveConfidence,
  distributionScore,
  formatPeriodLabel,
  formatPct,
  formatUsd,
  lowestConfidence,
  makeInsightId,
  makePatternId,
  resolveEthPriceUsd,
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
  txGasUsd,
  txNetwork,
  txNetworkLabel,
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

/** Wallet behaviour across networks, never a label for the person (Spec §5.106). */
export type NetworkProfile =
  | 'single_chain_user'
  | 'multi_chain_user'
  | 'defi_explorer'
  | 'network_specialist';

export interface NetworkStats {
  network: string;
  label: string;
  valueUsd: number;
  /** Network value / portfolio value × 100 (Spec §5.103). */
  allocationPct: number;
  txCount: number;
  /** Network transactions / total transactions × 100. */
  activitySharePct: number;
  volumeUsd: number;
  volumeSharePct: number;
  gasUsd: number;
  gasSharePct: number;
  avgGasUsd: number;
  /** Gas as a share of volume moved on this network. */
  gasToVolumePct: number | null;
  contractInteractionCount: number;
  assetCount: number;
  firstSeenMs: number | null;
  lastActivityMs: number | null;
  daysSinceLastActivity: number | null;
  /** Value present but no activity recorded in the window. */
  dormant: boolean;
  /** Allocation minus activity share, in percentage points. */
  capitalActivityGapPp: number;
  previousTxCount: number;
  txCountChangePct: number | null;
}

export interface NetworkHealthScore {
  total: number;
  components: {
    distribution: number;
    activityBalance: number;
    costEfficiency: number;
    networkDiversity: number;
    dataQuality: number;
  };
  breakdown: {
    distribution: number;
    activityBalance: number;
    costEfficiency: number;
    networkDiversity: number;
    dataQuality: number;
  };
  weights: {
    distribution: 30;
    activityBalance: 25;
    costEfficiency: 20;
    networkDiversity: 15;
    dataQuality: 10;
  };
  limitingFactor: string;
}

export interface NetworkMetrics {
  periodDays: number;
  portfolioValueUsd: number;
  networks: NetworkStats[];
  networkCount: number;
  /** Networks with recorded activity inside the window. */
  activeNetworkCount: number;
  dominantByValue: NetworkStats | null;
  dominantByActivity: NetworkStats | null;
  largestNetworkSharePct: number;
  totalTxCount: number;
  totalVolumeUsd: number;
  totalGasUsd: number;
  avgGasUsd: number;
  /** Total gas as a share of total volume moved. */
  gasToVolumePct: number | null;
  contractInteractionCount: number;
  newNetworks: string[];
  dormantNetworks: string[];
  valueDistributionScore: number;
  activityDistributionScore: number;
  healthScore: NetworkHealthScore;
  profile: NetworkProfile;
  profileIndicators: string[];
  /** True when gas could not be resolved for most rows. */
  gasDataMissing: boolean;
}

export type NetworkIntelligence = IntelligenceResult<NetworkMetrics>;

const SINGLE_NETWORK_SHARE_PCT = 80;
const MULTI_CHAIN_MAX_SHARE_PCT = 60;
const MISMATCH_HIGH_ALLOCATION_PCT = 70;
const MISMATCH_LOW_ACTIVITY_PCT = 20;
const MISMATCH_LOW_ALLOCATION_PCT = 15;
const MISMATCH_HIGH_ACTIVITY_PCT = 50;
const DORMANT_NETWORK_DAYS = 45;
const GAS_CONCENTRATION_PCT = 70;
const GAS_TO_VOLUME_ELEVATED_PCT = 2;
const MIGRATION_SHIFT_PP = 20;
const DEFI_CONTRACT_SHARE_PCT = 40;

const HEALTH_WEIGHTS = {
  distribution: 30,
  activityBalance: 25,
  costEfficiency: 20,
  networkDiversity: 15,
  dataQuality: 10,
} as const;

interface NetworkAccumulator {
  network: string;
  label: string;
  valueUsd: number;
  assetCount: number;
  txCount: number;
  previousTxCount: number;
  volumeUsd: number;
  gasUsd: number;
  gasRows: number;
  contractInteractionCount: number;
  firstSeenMs: number | null;
  lastActivityMs: number | null;
}

export function analyzeNetworks(input: IntelligenceInput): NetworkIntelligence {
  const period = resolvePeriod(input);
  const txs = resolveTransactions(input);
  const dataQuality = buildDataQuality(txs);
  const ethPriceUsd = resolveEthPriceUsd(input);
  const portfolioValueUsd = resolvePortfolioValueUsd(input);
  const ledger = buildAssetLedger(input, period);

  const accumulators = new Map<string, NetworkAccumulator>();
  const ensure = (network: string, label: string): NetworkAccumulator => {
    const existing = accumulators.get(network);
    if (existing) return existing;
    const created: NetworkAccumulator = {
      network,
      label,
      valueUsd: 0,
      assetCount: 0,
      txCount: 0,
      previousTxCount: 0,
      volumeUsd: 0,
      gasUsd: 0,
      gasRows: 0,
      contractInteractionCount: 0,
      firstSeenMs: null,
      lastActivityMs: null,
    };
    accumulators.set(network, created);
    return created;
  };

  for (const entry of ledger.entries) {
    if (!entry.held || entry.valueUsd <= 0) continue;
    const acc = ensure(entry.network, capitalize(entry.network));
    acc.valueUsd += entry.valueUsd;
    acc.assetCount += 1;
  }

  const split = splitByPeriod(txs, txTimestampMs, period);
  for (const tx of split.current) {
    const acc = ensure(txNetwork(tx), txNetworkLabel(tx));
    const ms = txTimestampMs(tx);
    const usd = txUsd(tx);
    const gas = txGasUsd(tx, ethPriceUsd);

    acc.txCount += 1;
    if (usd != null) acc.volumeUsd += usd;
    if (gas > 0) {
      acc.gasUsd += gas;
      acc.gasRows += 1;
    }
    if (isContractInteraction(tx)) acc.contractInteractionCount += 1;
    if (ms != null) {
      if (acc.firstSeenMs == null || ms < acc.firstSeenMs) acc.firstSeenMs = ms;
      if (acc.lastActivityMs == null || ms > acc.lastActivityMs) acc.lastActivityMs = ms;
    }
  }
  for (const tx of split.previous) {
    ensure(txNetwork(tx), txNetworkLabel(tx)).previousTxCount += 1;
  }

  const totalTxCount = split.current.length;
  const totalVolumeUsd = round2(sum([...accumulators.values()].map(a => a.volumeUsd)));
  const totalGasUsd = round2(sum([...accumulators.values()].map(a => a.gasUsd)));
  const totalValueUsd = sum([...accumulators.values()].map(a => a.valueUsd));
  const gasRows = sum([...accumulators.values()].map(a => a.gasRows));

  const networks = [...accumulators.values()]
    .map(acc => buildStats(acc, totalValueUsd, totalTxCount, totalVolumeUsd, totalGasUsd, period))
    .sort((a, b) =>
      b.valueUsd === a.valueUsd
        ? b.txCount === a.txCount
          ? a.network.localeCompare(b.network)
          : b.txCount - a.txCount
        : b.valueUsd - a.valueUsd,
    );

  const activeNetworks = networks.filter(n => n.txCount > 0);
  const dominantByValue = topN(networks, 1, n => n.valueUsd)[0] ?? null;
  const dominantByActivity = topN(networks, 1, n => n.txCount)[0] ?? null;
  const valueDistributionScore = distributionScore(networks.map(n => n.allocationPct));
  const activityDistributionScore = distributionScore(networks.map(n => n.activitySharePct));
  const contractInteractionCount = sum(networks.map(n => n.contractInteractionCount));

  const healthScore = computeHealthScore({
    valueDistributionScore,
    activityDistributionScore,
    networks,
    activeNetworkCount: activeNetworks.length,
    gasToVolumePct: totalVolumeUsd > 0 ? round2((totalGasUsd / totalVolumeUsd) * 100) : null,
    dataCompleteness: dataQuality.completeness,
    gasCoveragePct: totalTxCount > 0 ? sharePct(gasRows, totalTxCount) : 0,
    pricedValueSharePct: ledger.pricedValueSharePct,
  });

  const profileResult = classifyProfile({
    activeNetworkCount: activeNetworks.length,
    largestNetworkSharePct: dominantByValue?.allocationPct ?? 0,
    valueDistributionScore,
    activityDistributionScore,
    contractSharePct: totalTxCount > 0 ? sharePct(contractInteractionCount, totalTxCount) : 0,
    networkCount: networks.length,
  });

  const metrics: NetworkMetrics = {
    periodDays: period.days,
    portfolioValueUsd,
    networks,
    networkCount: networks.length,
    activeNetworkCount: activeNetworks.length,
    dominantByValue,
    dominantByActivity,
    largestNetworkSharePct: dominantByValue?.allocationPct ?? 0,
    totalTxCount,
    totalVolumeUsd,
    totalGasUsd,
    avgGasUsd: totalTxCount > 0 ? round2(totalGasUsd / totalTxCount) : 0,
    gasToVolumePct: totalVolumeUsd > 0 ? round2((totalGasUsd / totalVolumeUsd) * 100) : null,
    contractInteractionCount,
    newNetworks: networks.filter(n => n.txCount > 0 && n.previousTxCount === 0).map(n => n.network),
    dormantNetworks: networks.filter(n => n.dormant).map(n => n.network),
    valueDistributionScore,
    activityDistributionScore,
    healthScore,
    profile: profileResult.profile,
    profileIndicators: profileResult.indicators,
    gasDataMissing: totalTxCount > 0 && gasRows < totalTxCount / 2,
  };

  const confidence = lowestConfidence(
    input.dataGrounding === 'screen' &&
      (ledger.pricedValueSharePct >= 80 || dataQuality.completeness >= 50)
      ? 'high'
      : deriveConfidence(dataQuality, { minSampleForHigh: 15, minSampleForMedium: 4 }),
    networks.length === 0 ? 'low' : 'high',
    input.dataGrounding === 'screen' ? 'high' : metrics.gasDataMissing ? 'medium' : 'high',
  );

  const patterns = detectPatterns(metrics, period, confidence);
  const insights = buildInsights(metrics, patterns, period);

  return {
    summary: buildSummary(metrics, period),
    metrics,
    patterns,
    insights,
    confidence,
    evidence: compactEvidence({
      period: formatPeriodLabel(period.days),
      network_count: metrics.networkCount,
      active_network_count: metrics.activeNetworkCount,
      dominant_network: metrics.dominantByValue?.network,
      largest_network_share_pct: metrics.largestNetworkSharePct,
      dominant_activity_network: metrics.dominantByActivity?.network,
      total_tx_count: metrics.totalTxCount,
      total_volume_usd: metrics.totalVolumeUsd,
      total_gas_usd: metrics.totalGasUsd,
      gas_to_volume_pct: metrics.gasToVolumePct,
      network_health_score: metrics.healthScore.total,
      network_profile: metrics.profile,
    }),
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Per-network stats (Spec §5.103)
// ---------------------------------------------------------------------------

function buildStats(
  acc: NetworkAccumulator,
  totalValueUsd: number,
  totalTxCount: number,
  totalVolumeUsd: number,
  totalGasUsd: number,
  period: ResolvedPeriod,
): NetworkStats {
  const allocationPct = sharePct(acc.valueUsd, totalValueUsd);
  const activitySharePct = totalTxCount > 0 ? sharePct(acc.txCount, totalTxCount) : 0;
  const daysSinceLastActivity =
    acc.lastActivityMs != null ? round1(daysBetween(acc.lastActivityMs, period.now)) : null;

  return {
    network: acc.network,
    label: acc.label,
    valueUsd: round2(acc.valueUsd),
    allocationPct,
    txCount: acc.txCount,
    activitySharePct,
    volumeUsd: round2(acc.volumeUsd),
    volumeSharePct: sharePct(acc.volumeUsd, totalVolumeUsd),
    gasUsd: round2(acc.gasUsd),
    gasSharePct: sharePct(acc.gasUsd, totalGasUsd),
    avgGasUsd: acc.txCount > 0 ? round2(acc.gasUsd / acc.txCount) : 0,
    gasToVolumePct: acc.volumeUsd > 0 ? round2((acc.gasUsd / acc.volumeUsd) * 100) : null,
    contractInteractionCount: acc.contractInteractionCount,
    assetCount: acc.assetCount,
    firstSeenMs: acc.firstSeenMs,
    lastActivityMs: acc.lastActivityMs,
    daysSinceLastActivity,
    dormant:
      acc.valueUsd > 0 &&
      (daysSinceLastActivity == null || daysSinceLastActivity >= DORMANT_NETWORK_DAYS),
    capitalActivityGapPp: round2(allocationPct - activitySharePct),
    previousTxCount: acc.previousTxCount,
    txCountChangePct:
      acc.previousTxCount > 0
        ? round2(((acc.txCount - acc.previousTxCount) / acc.previousTxCount) * 100)
        : null,
  };
}

/** Contract usage rather than a plain transfer (Spec §5.103 Contract Interaction Count). */
function isContractInteraction(tx: IntelligenceTransaction): boolean {
  if (tx.protocol) return true;
  const type = txType(tx);
  if (type === 'trade' || type === 'defi' || type === 'bridge' || type === 'staking') return true;
  const method = (tx.methodName ?? tx.method_name ?? '').toString().trim();
  return method.length > 0 && method.toLowerCase() !== 'transfer';
}

function capitalize(value: string): string {
  if (!value) return 'Unknown network';
  if (value === 'unknown') return 'Unknown network';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------------------
// Network Health Score (Spec §5.104)
// ---------------------------------------------------------------------------

interface HealthInputs {
  valueDistributionScore: number;
  activityDistributionScore: number;
  networks: NetworkStats[];
  activeNetworkCount: number;
  gasToVolumePct: number | null;
  dataCompleteness: number;
  gasCoveragePct: number;
  pricedValueSharePct: number;
}

function computeHealthScore(inputs: HealthInputs): NetworkHealthScore {
  const distribution = score100(inputs.valueDistributionScore);

  // Activity balance measures how closely activity tracks where value sits.
  const totalGap = sum(inputs.networks.map(n => Math.abs(n.capitalActivityGapPp)));
  const activityBalance = score100(100 - totalGap / 2);

  // Cost efficiency compares gas against the volume it moved.
  const costEfficiency =
    inputs.gasToVolumePct == null
      ? 50
      : score100(100 - clamp(inputs.gasToVolumePct, 0, 10) * 10);

  const networkDiversity = score100(
    inputs.activeNetworkCount <= 1 ? 25 : 25 + (inputs.activeNetworkCount - 1) * 25,
  );

  const dataQuality = score100(
    inputs.dataCompleteness * 0.4 + inputs.gasCoveragePct * 0.3 + inputs.pricedValueSharePct * 0.3,
  );

  const components = { distribution, activityBalance, costEfficiency, networkDiversity, dataQuality };
  const breakdown = {
    distribution: round1((distribution * HEALTH_WEIGHTS.distribution) / 100),
    activityBalance: round1((activityBalance * HEALTH_WEIGHTS.activityBalance) / 100),
    costEfficiency: round1((costEfficiency * HEALTH_WEIGHTS.costEfficiency) / 100),
    networkDiversity: round1((networkDiversity * HEALTH_WEIGHTS.networkDiversity) / 100),
    dataQuality: round1((dataQuality * HEALTH_WEIGHTS.dataQuality) / 100),
  };

  const limitingFactor = (Object.keys(breakdown) as Array<keyof typeof breakdown>).reduce(
    (worst, key) =>
      HEALTH_WEIGHTS[key] - breakdown[key] > HEALTH_WEIGHTS[worst] - breakdown[worst] ? key : worst,
    'distribution' as keyof typeof breakdown,
  );

  return {
    total: score100(sum(Object.values(breakdown))),
    components,
    breakdown,
    weights: HEALTH_WEIGHTS,
    limitingFactor,
  };
}

// ---------------------------------------------------------------------------
// Profiles (Spec §5.106)
// ---------------------------------------------------------------------------

interface ProfileInputs {
  activeNetworkCount: number;
  largestNetworkSharePct: number;
  valueDistributionScore: number;
  activityDistributionScore: number;
  contractSharePct: number;
  networkCount: number;
}

function classifyProfile(inputs: ProfileInputs): {
  profile: NetworkProfile;
  indicators: string[];
} {
  const indicators: string[] = [];

  if (
    inputs.activeNetworkCount <= 2 &&
    inputs.largestNetworkSharePct >= SINGLE_NETWORK_SHARE_PCT
  ) {
    indicators.push('active_networks_le_2', 'largest_network_share_ge_80');
    return { profile: 'single_chain_user', indicators };
  }

  if (
    inputs.contractSharePct >= DEFI_CONTRACT_SHARE_PCT &&
    inputs.activeNetworkCount >= 2
  ) {
    indicators.push('high_contract_interaction', 'multiple_networks');
    return { profile: 'defi_explorer', indicators };
  }

  // Value spread wide but activity funnelled into one place.
  if (
    inputs.valueDistributionScore >= 50 &&
    inputs.activityDistributionScore < 40 &&
    inputs.networkCount >= 2
  ) {
    indicators.push('value_distributed', 'activity_concentrated');
    return { profile: 'network_specialist', indicators };
  }

  if (
    inputs.activeNetworkCount >= 3 &&
    inputs.largestNetworkSharePct < MULTI_CHAIN_MAX_SHARE_PCT
  ) {
    indicators.push('active_networks_ge_3', 'no_network_above_60', 'activity_distributed');
    return { profile: 'multi_chain_user', indicators };
  }

  indicators.push('mixed_distribution');
  return { profile: 'multi_chain_user', indicators };
}

export function describeNetworkProfile(profile: NetworkProfile): string {
  switch (profile) {
    case 'single_chain_user':
      return 'Value and activity both sit in a single network environment.';
    case 'defi_explorer':
      return 'Activity consists largely of contract interactions spread over more than one network.';
    case 'network_specialist':
      return 'Value is held across several networks while operations run mainly on one.';
    default:
      return 'The wallet operates across more than one network environment.';
  }
}

// ---------------------------------------------------------------------------
// Patterns (Spec §5.105)
// ---------------------------------------------------------------------------

function detectPatterns(
  metrics: NetworkMetrics,
  period: ResolvedPeriod,
  confidence: Confidence,
): Pattern[] {
  const patterns: Pattern[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  // Pattern 1 — Single Network Dependency
  const dominant = metrics.dominantByValue;
  if (
    dominant &&
    dominant.allocationPct >= SINGLE_NETWORK_SHARE_PCT &&
    metrics.activeNetworkCount <= 2
  ) {
    patterns.push({
      id: makePatternId('network', 'single_network_dependency', dominant.network),
      type: 'single_network_dependency',
      name: 'Single Network Dependency',
      description: 'Most of the portfolio value sits on a single network.',
      category: 'network',
      confidence,
      evidence: compactEvidence({
        network: dominant.network,
        allocation_pct: dominant.allocationPct,
        value_usd: dominant.valueUsd,
        active_network_count: metrics.activeNetworkCount,
      }),
    });
  }

  // Pattern 2 — Multi-chain Expansion
  if (metrics.newNetworks.length > 0) {
    const newest = metrics.networks.find(n => n.network === metrics.newNetworks[0]) ?? null;
    patterns.push({
      id: makePatternId('network', 'multi_chain_expansion'),
      type: 'multi_chain_expansion',
      name: 'Multi-chain Expansion',
      description: 'Activity extended to a network that was not previously used.',
      category: 'network',
      confidence,
      evidence: compactEvidence({
        new_networks: metrics.newNetworks.join(', '),
        new_network_count: metrics.newNetworks.length,
        new_network_tx_count: newest?.txCount,
        new_network_allocation_pct: newest?.allocationPct,
        active_network_count: metrics.activeNetworkCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 3 — Activity Migration
  const migration = detectMigration(metrics.networks);
  if (migration) {
    patterns.push({
      id: makePatternId('network', 'activity_migration', `${migration.from.network}-${migration.to.network}`),
      type: 'activity_migration',
      name: 'Activity Migration',
      description: 'Transaction activity shifted from one network to another during the period.',
      category: 'network',
      confidence,
      evidence: compactEvidence({
        from_network: migration.from.network,
        from_previous_tx_count: migration.from.previousTxCount,
        from_tx_count: migration.from.txCount,
        to_network: migration.to.network,
        to_previous_tx_count: migration.to.previousTxCount,
        to_tx_count: migration.to.txCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 4 — Capital vs Activity Mismatch (Spec: the most important pattern here)
  const mismatch = detectMismatch(metrics.networks);
  if (mismatch) {
    patterns.push({
      id: makePatternId('network', 'capital_activity_mismatch', mismatch.storage.network),
      type: 'capital_activity_mismatch',
      name: 'Capital vs Activity Mismatch',
      description: 'Value is concentrated on one network while activity happens mainly on another.',
      category: 'network',
      confidence,
      evidence: compactEvidence({
        storage_network: mismatch.storage.network,
        storage_allocation_pct: mismatch.storage.allocationPct,
        storage_activity_share_pct: mismatch.storage.activitySharePct,
        operating_network: mismatch.operating.network,
        operating_allocation_pct: mismatch.operating.allocationPct,
        operating_activity_share_pct: mismatch.operating.activitySharePct,
        gap_pp: mismatch.storage.capitalActivityGapPp,
        period: periodLabel,
      }),
    });
  }

  // Pattern 5 — High Gas Exposure
  const gasLeader = topN(metrics.networks, 1, n => n.gasUsd)[0];
  if (
    gasLeader &&
    gasLeader.gasUsd > 0 &&
    gasLeader.gasSharePct >= GAS_CONCENTRATION_PCT &&
    (metrics.gasToVolumePct ?? 0) >= GAS_TO_VOLUME_ELEVATED_PCT
  ) {
    patterns.push({
      id: makePatternId('network', 'high_gas_exposure', gasLeader.network),
      type: 'high_gas_exposure',
      name: 'High Gas Exposure',
      description: 'A large share of operating cost is generated on one network.',
      category: 'network',
      confidence: metrics.gasDataMissing ? 'low' : confidence,
      evidence: compactEvidence({
        network: gasLeader.network,
        gas_usd: gasLeader.gasUsd,
        gas_share_pct: gasLeader.gasSharePct,
        gas_to_volume_pct: gasLeader.gasToVolumePct,
        total_gas_usd: metrics.totalGasUsd,
        tx_count: gasLeader.txCount,
        period: periodLabel,
      }),
    });
  }

  // Pattern 6 — Dormant Network
  const dormant = topN(
    metrics.networks.filter(n => n.dormant && n.valueUsd > 0),
    1,
    n => n.valueUsd,
  )[0];
  if (dormant) {
    patterns.push({
      id: makePatternId('network', 'dormant_network', dormant.network),
      type: 'dormant_network',
      name: 'Dormant Network',
      description: 'This network holds value without recent activity.',
      category: 'network',
      confidence,
      evidence: compactEvidence({
        network: dormant.network,
        value_usd: dormant.valueUsd,
        allocation_pct: dormant.allocationPct,
        days_since_last_activity: dormant.daysSinceLastActivity,
        tx_count: dormant.txCount,
      }),
    });
  }

  return patterns;
}

function detectMigration(
  networks: NetworkStats[],
): { from: NetworkStats; to: NetworkStats } | null {
  const withHistory = networks.filter(n => n.previousTxCount > 0 || n.txCount > 0);
  const previousTotal = sum(withHistory.map(n => n.previousTxCount));
  const currentTotal = sum(withHistory.map(n => n.txCount));
  if (previousTotal < 3 || currentTotal < 3) return null;

  const shifts = withHistory.map(n => ({
    network: n,
    shiftPp: round2(
      sharePct(n.txCount, currentTotal) - sharePct(n.previousTxCount, previousTotal),
    ),
  }));
  const down = shifts.filter(s => s.shiftPp <= -MIGRATION_SHIFT_PP).sort((a, b) => a.shiftPp - b.shiftPp);
  const up = shifts.filter(s => s.shiftPp >= MIGRATION_SHIFT_PP).sort((a, b) => b.shiftPp - a.shiftPp);
  if (down.length === 0 || up.length === 0) return null;
  return { from: down[0].network, to: up[0].network };
}

function detectMismatch(
  networks: NetworkStats[],
): { storage: NetworkStats; operating: NetworkStats } | null {
  const storage = networks.find(
    n => n.allocationPct >= MISMATCH_HIGH_ALLOCATION_PCT && n.activitySharePct <= MISMATCH_LOW_ACTIVITY_PCT,
  );
  const operating = networks.find(
    n => n.allocationPct <= MISMATCH_LOW_ALLOCATION_PCT && n.activitySharePct >= MISMATCH_HIGH_ACTIVITY_PCT,
  );
  if (storage && operating) return { storage, operating };
  if (storage) {
    const busiest = topN(networks.filter(n => n.network !== storage.network), 1, n => n.txCount)[0];
    if (busiest && busiest.txCount > 0) return { storage, operating: busiest };
  }
  if (operating) {
    const richest = topN(networks.filter(n => n.network !== operating.network), 1, n => n.valueUsd)[0];
    if (richest && richest.valueUsd > 0) return { storage: richest, operating };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Insights (Spec §5.108)
// ---------------------------------------------------------------------------

function buildInsights(
  metrics: NetworkMetrics,
  patterns: Pattern[],
  period: ResolvedPeriod,
): Insight[] {
  const insights: Insight[] = [];
  const periodLabel = formatPeriodLabel(period.days);

  if (metrics.networkCount === 0) {
    insights.push({
      id: makeInsightId('network', 'no_network_data'),
      type: 'no_network_data',
      category: 'network',
      title: 'No network activity or holdings were available',
      description: 'No transactions or holdings carried network information, so network analysis could not run.',
      severity: 'informational',
      confidence: 'low',
      impactUsd: null,
      evidence: compactEvidence({ network_count: 0, period: periodLabel }),
    });
    return insights;
  }

  for (const pattern of patterns) {
    insights.push(insightFromPattern(pattern, metrics, periodLabel));
  }

  if (metrics.gasDataMissing && metrics.totalTxCount > 0) {
    insights.push({
      id: makeInsightId('network', 'gas_data_incomplete'),
      type: 'gas_data_incomplete',
      category: 'network',
      title: 'Gas cost is available for only part of the activity',
      description: `Fee data could not be resolved for most of the ${metrics.totalTxCount} transactions recorded over ${periodLabel}. Reported gas totals cover only the rows that carried a fee value.`,
      severity: 'low',
      confidence: 'low',
      impact: 'Operating cost per network is understated.',
      impactUsd: metrics.totalGasUsd,
      evidence: compactEvidence({
        total_gas_usd: metrics.totalGasUsd,
        total_tx_count: metrics.totalTxCount,
        gas_to_volume_pct: metrics.gasToVolumePct,
      }),
    });
  }

  return insights;
}

function insightFromPattern(
  pattern: Pattern,
  metrics: NetworkMetrics,
  periodLabel: string,
): Insight {
  const network = typeof pattern.evidence.network === 'string' ? pattern.evidence.network : null;
  const base = {
    id: makeInsightId('network', pattern.type, network ?? String(pattern.evidence.storage_network ?? '')),
    type: pattern.type,
    category: 'network' as const,
    confidence: pattern.confidence,
    evidence: pattern.evidence,
  };

  switch (pattern.type) {
    case 'single_network_dependency':
      return {
        ...base,
        title: `${formatPct(Number(pattern.evidence.allocation_pct ?? 0))} of value sits on ${network}`,
        description: `Portfolio outcomes and operating conditions are tied to one network environment. Fees, availability, and settlement behaviour on ${network} affect the whole position.`,
        severity: 'medium',
        impact: 'The whole position depends on the conditions of one network.',
        impactUsd: Number(pattern.evidence.value_usd ?? 0),
        relatedEntities: network ? [network] : undefined,
      };
    case 'multi_chain_expansion':
      return {
        ...base,
        title: 'Activity extended to a network not used before',
        description: `Transactions were recorded on ${metrics.newNetworks.length} network(s) with no activity in the previous period. The operating footprint of the wallet widened during ${periodLabel}.`,
        severity: 'low',
        impact: 'More network environments are now in use.',
        impactUsd: null,
        relatedEntities: metrics.newNetworks,
      };
    case 'activity_migration':
      return {
        ...base,
        title: `Activity moved from ${pattern.evidence.from_network} to ${pattern.evidence.to_network}`,
        description: `Transaction counts fell on ${pattern.evidence.from_network} and rose on ${pattern.evidence.to_network} over ${periodLabel}. The change appears in where operations are executed, not necessarily in what is held.`,
        severity: 'informational',
        impact: 'Operations run in a different environment than before.',
        impactUsd: null,
        relatedEntities: [
          String(pattern.evidence.from_network ?? ''),
          String(pattern.evidence.to_network ?? ''),
        ].filter(Boolean),
      };
    case 'capital_activity_mismatch':
      return {
        ...base,
        title: `Value sits on ${pattern.evidence.storage_network} while activity runs on ${pattern.evidence.operating_network}`,
        description: `${formatPct(Number(pattern.evidence.storage_allocation_pct ?? 0))} of value is held on ${pattern.evidence.storage_network}, which carries ${formatPct(Number(pattern.evidence.storage_activity_share_pct ?? 0))} of transactions, while ${pattern.evidence.operating_network} carries ${formatPct(Number(pattern.evidence.operating_activity_share_pct ?? 0))} of activity. The wallet stores value in one environment and operates in another.`,
        severity: 'medium',
        impact: 'Storage and operations are split across different environments.',
        impactUsd: round2(
          (metrics.portfolioValueUsd * Number(pattern.evidence.storage_allocation_pct ?? 0)) / 100,
        ),
        relatedEntities: [
          String(pattern.evidence.storage_network ?? ''),
          String(pattern.evidence.operating_network ?? ''),
        ].filter(Boolean),
      };
    case 'high_gas_exposure':
      return {
        ...base,
        title: `Most operating cost is generated on ${network}`,
        description: `${formatUsd(Number(pattern.evidence.gas_usd ?? 0))} of ${formatUsd(metrics.totalGasUsd)} in recorded fees over ${periodLabel} was spent on ${network}, equal to ${formatPct(Number(pattern.evidence.gas_to_volume_pct ?? 0))} of the volume moved there. Operating cost is structurally linked to where transactions are executed.`,
        severity: 'low',
        impact: 'Operating cost concentrates in one environment.',
        impactUsd: Number(pattern.evidence.gas_usd ?? 0),
        relatedEntities: network ? [network] : undefined,
      };
    default:
      return {
        ...base,
        title: `${network} holds value without recent activity`,
        description: `${formatUsd(Number(pattern.evidence.value_usd ?? 0))} remains on ${network} with no transactions recorded in ${formatDaysLabel(pattern.evidence.days_since_last_activity)}. Exposure remains on a network that is no longer part of active operations.`,
        severity: 'informational',
        impact: 'Value stays exposed to an environment that is not being operated.',
        impactUsd: Number(pattern.evidence.value_usd ?? 0),
        relatedEntities: network ? [network] : undefined,
      };
  }
}

function formatDaysLabel(value: string | number | undefined): string {
  const num = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(num) ? `${Math.round(num)} days` : 'the synced history';
}

// ---------------------------------------------------------------------------
// Summary (Spec §5.111)
// ---------------------------------------------------------------------------

function buildSummary(metrics: NetworkMetrics, period: ResolvedPeriod): string {
  if (metrics.networkCount === 0) {
    return 'No network information was available in the supplied data.';
  }

  const parts: string[] = [];
  const value = metrics.dominantByValue;
  const activity = metrics.dominantByActivity;

  parts.push(
    `Value and activity are spread over ${metrics.networkCount} network(s), ${metrics.activeNetworkCount} of which recorded transactions in the last ${period.days} days.`,
  );
  if (value) {
    parts.push(
      `${value.label} holds the largest share of value at ${formatPct(value.allocationPct)} (${formatUsd(value.valueUsd)}).`,
    );
  }
  if (activity && activity.txCount > 0) {
    parts.push(
      `${activity.label} carries the most activity with ${activity.txCount} transactions, ${formatPct(activity.activitySharePct)} of the total.`,
    );
  }
  if (metrics.totalGasUsd > 0) {
    parts.push(
      `Recorded fees total ${formatUsd(metrics.totalGasUsd)}, averaging ${formatUsd(metrics.avgGasUsd)} per transaction.`,
    );
  }
  parts.push(describeNetworkProfile(metrics.profile));
  parts.push(
    `The network usage score is ${metrics.healthScore.total} out of 100; it describes how the wallet uses networks, not the networks themselves.`,
  );

  return parts.join(' ');
}

/** Networks ordered by allocation — used by response templates and tool output. */
export function rankNetworksByValue(metrics: NetworkMetrics, limit = 5): NetworkStats[] {
  return topN(metrics.networks, limit, n => n.valueUsd);
}
