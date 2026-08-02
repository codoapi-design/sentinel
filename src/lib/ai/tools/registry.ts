/**
 * Radareum AI — Business Tool Registry
 *
 * The single authoritative catalog of everything the agent can call
 * (Part 3 §3.5–§3.7). One rule governs this file:
 *
 *   The model calls tools. The model never sees a table, a column, or SQL.
 *
 * Every tool returns the **Unified Engine Output Contract** from Spec §5.0.6.1,
 * so the explanation layer reads one envelope shape and never a module's
 * internal structure.
 *
 * Naming: Part 3, Module 10, and Part 7 §7.4 each name the same business
 * capability slightly differently. This registry picks one canonical name per
 * capability and records the other spellings as `aliases`, which
 * `resolveToolName` accepts. Nothing is dropped; only one name is preferred.
 *
 * `wallet_id` is deliberately absent from every parameter schema: the wallet is
 * bound by the authenticated request, never chosen by the model.
 */

import {
  rankInsights,
  runFullIntelligence,
  type Confidence,
  type Evidence,
  type FullIntelligence,
  type Insight,
  type IntelligenceCategory,
  type IntelligenceResult,
  type Pattern,
  type Severity,
} from '@/lib/ai/intelligence';
import {
  aggregateRef,
  calculationRef,
  counterpartyRef,
  positionRef,
  snapshotRef,
  withNativeSourceRefs,
} from '@/lib/ai/intelligence/shared';

import type { WalletContext } from './context';

// ---------------------------------------------------------------------------
// Unified Engine Output Contract (Spec §5.0.6.1)
// ---------------------------------------------------------------------------

export type EngineStatus = 'completed' | 'partial' | 'insufficient_data';

export type EngineMetrics = Record<string, unknown>;

export interface EngineDataQuality {
  transactionCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** 0–1, per Spec §5.0.6.1 (the engines report 0–100 internally). */
  completeness: number;
  /** True when the transaction cap limited how much history was read. */
  truncated: boolean;
  /** Neutral statements about what limits this analysis. */
  notes: string[];
}

export interface EngineOutput {
  /** Module identifier, e.g. `risk`. */
  engine: string;
  status: EngineStatus;
  summary: string;
  metrics: EngineMetrics;
  patterns: Pattern[];
  findings: Insight[];
  evidence: Evidence;
  confidence: Confidence;
  dataQuality: EngineDataQuality;
  /** Suggested follow-up **analyses** only — never investment advice. */
  recommendedFollowup: string[];
  /** Tool that produced this envelope, for traceability. */
  tool: ToolName;
  periodDays: number;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Tool contract
// ---------------------------------------------------------------------------

/** Part 3 §3.5 — the six tool families. */
export type ToolCategory =
  | 'retrieval'
  | 'analysis'
  | 'intelligence'
  | 'export'
  | 'alert'
  | 'action';

export type ToolName =
  | 'get_portfolio_overview'
  | 'get_performance_analysis'
  | 'get_flow_analysis'
  | 'get_asset_intelligence'
  | 'get_risk_intelligence'
  | 'get_trading_intelligence'
  | 'get_network_intelligence'
  | 'get_counterparty_intelligence'
  | 'detect_anomalies'
  | 'get_wallet_alerts'
  | 'generate_intelligence_report';

export type AnomalyScope = 'transactions' | 'flow' | 'counterparty' | 'all';

/**
 * Arguments accepted across the catalog. Each tool documents the subset it
 * reads in its JSON schema; anything else is ignored rather than rejected, so
 * a slightly over-eager caller never fails a request.
 */
export interface ToolArgs {
  /** Asset symbol to focus on, e.g. `ETH`. */
  asset?: string;
  /** Network key or label to focus on, e.g. `base`. */
  network?: string;
  /** Counterparty display name or address to focus on. */
  counterparty?: string;
  /** Anomaly surface to aggregate. */
  scope?: AnomalyScope;
  /** Minimum severity for alert retrieval. */
  severity?: Severity;
  /** Maximum rows returned by list-shaped tools. */
  limit?: number;
}

/** JSON Schema object, as sent to an OpenAI-compatible `tools` parameter. */
export type ToolParameterSchema = Record<string, unknown>;

export interface ToolContext {
  wallet: WalletContext;
  /**
   * Full intelligence run, memoised for the request. Risk consumes the other
   * modules, so a single run keeps every engine executing exactly once.
   */
  getIntelligence(): FullIntelligence;
}

export interface ToolDefinition {
  name: ToolName;
  /** Other Spec spellings of the same capability, accepted by the resolver. */
  aliases: string[];
  description: string;
  category: ToolCategory;
  parameters: ToolParameterSchema;
  execute(args: ToolArgs, ctx: ToolContext): EngineOutput;
}

export function createToolContext(wallet: WalletContext): ToolContext {
  let cached: FullIntelligence | null = null;
  return {
    wallet,
    getIntelligence() {
      if (!cached) cached = runFullIntelligence(wallet.intelligenceInput);
      return cached;
    },
  };
}

// ---------------------------------------------------------------------------
// Envelope construction
// ---------------------------------------------------------------------------

const PARTIAL_COMPLETENESS_PCT = 60;

/**
 * Interfaces carry no implicit index signature, so a module's metrics type is
 * not assignable to `Record<string, unknown>` even though the shape matches.
 * The value is never modified.
 */
function asMetrics(metrics: object): EngineMetrics {
  return metrics as unknown as EngineMetrics;
}

function resolveStatus(ctx: ToolContext, result: Pick<IntelligenceResult<unknown>, 'confidence' | 'dataQuality'>): EngineStatus {
  const { coverage } = ctx.wallet;
  if (result.dataQuality.transactionCount === 0 && !coverage.hasHoldings) return 'insufficient_data';

  // Analyze button grounded on the visible page: do not degrade a priced
  // holdings/activity view to "partial" just because older txs lack USD.
  if (ctx.wallet.intelligenceInput.dataGrounding === 'screen') {
    if (result.confidence === 'low') return 'partial';
    return 'completed';
  }

  if (result.confidence === 'low') return 'partial';
  if (coverage.truncated) return 'partial';
  if (result.dataQuality.completeness < PARTIAL_COMPLETENESS_PCT) return 'partial';
  return 'completed';
}

function toEngineDataQuality(ctx: ToolContext, result: Pick<IntelligenceResult<unknown>, 'dataQuality'>): EngineDataQuality {
  return {
    transactionCount: result.dataQuality.transactionCount,
    pricedCount: result.dataQuality.pricedCount,
    unpricedCount: result.dataQuality.unpricedCount,
    completeness: round4(result.dataQuality.completeness / 100),
    truncated: ctx.wallet.coverage.truncated,
    notes: ctx.wallet.coverage.notes,
  };
}

interface EnvelopeOptions {
  engine: string;
  tool: ToolName;
  ctx: ToolContext;
  result: IntelligenceResult<object>;
  /** Overrides the engine metrics, used by focused and composed tools. */
  metrics?: EngineMetrics;
  summary?: string;
  patterns?: Pattern[];
  findings?: Insight[];
  evidence?: Evidence;
  confidence?: Confidence;
  followup: string[];
}

function attachEngineSourceRefs(engine: string, findings: Insight[]): Insight[] {
  return withNativeSourceRefs(findings, engine, insight => {
    const refs = [calculationRef(engine, insight.type)];
    const entity = insight.relatedEntities?.[0];
    if (engine === 'asset' || engine === 'portfolio') {
      if (entity) refs.push(positionRef(entity));
      refs.push(aggregateRef(`${engine}:holdings`, 'asset_positions'));
    } else if (engine === 'flow' || engine === 'trading' || engine === 'network') {
      refs.push(aggregateRef(`${engine}:transactions`, 'transactions'));
    } else if (engine === 'counterparty') {
      if (entity) refs.push(counterpartyRef(entity));
      refs.push(aggregateRef('counterparty:volume', 'transactions'));
    } else if (engine === 'performance') {
      refs.push(aggregateRef('performance:snapshots', 'portfolio_snapshots'));
      if (typeof insight.evidence?.period_start === 'string') {
        refs.push(snapshotRef(String(insight.evidence.period_start)));
      }
    } else if (engine === 'risk') {
      refs.push(positionRef(entity ?? 'portfolio'));
      refs.push(aggregateRef('risk:structure', 'asset_positions'));
    }
    return refs;
  });
}

function buildEnvelope(options: EnvelopeOptions): EngineOutput {
  const { ctx, result } = options;
  const followup = [...options.followup];
  const confidence = options.confidence ?? result.confidence;

  if (ctx.wallet.coverage.truncated) {
    followup.push('narrow the period so the analysis fits inside the loaded history');
  }
  if (!ctx.wallet.coverage.hasSnapshots) {
    followup.push('synchronize the wallet to build daily value history');
  }

  const rawFindings = options.findings ?? result.insights;
  const findings = attachEngineSourceRefs(options.engine, rawFindings);

  return {
    engine: options.engine,
    tool: options.tool,
    status: resolveStatus(ctx, { ...result, confidence }),
    summary: options.summary ?? result.summary,
    metrics: options.metrics ?? asMetrics(result.metrics),
    patterns: options.patterns ?? result.patterns,
    findings,
    evidence: options.evidence ?? result.evidence,
    confidence,
    dataQuality: toEngineDataQuality(ctx, result),
    recommendedFollowup: dedupe(followup),
    periodDays: ctx.wallet.periodDays,
    generatedAt: ctx.wallet.now,
  };
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const NO_PARAMETERS: ToolParameterSchema = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

function objectSchema(properties: Record<string, unknown>): ToolParameterSchema {
  return { type: 'object', properties, additionalProperties: false };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const getPortfolioOverview: ToolDefinition = {
  name: 'get_portfolio_overview',
  aliases: ['analyze_portfolio', 'get_portfolio_summary', 'portfolio_overview'],
  category: 'analysis',
  description:
    'Current portfolio composition: total value, allocation by asset, network and category, concentration, diversification and the wallet health score. The cheapest full picture — use it first for any broad question.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();
    const portfolio = intelligence.portfolio;

    return buildEnvelope({
      engine: 'portfolio',
      tool: 'get_portfolio_overview',
      ctx,
      result: portfolio,
      metrics: {
        ...asMetrics(portfolio.metrics),
        // Headline figures the overview is expected to carry (Part 3 §3.7).
        roiPct: intelligence.performance.metrics.roiPct,
        valueChangeUsd: intelligence.performance.metrics.valueChangeUsd,
        growthPct: intelligence.performance.metrics.growthPct,
        riskScore: intelligence.risk.metrics.riskScore.total,
        riskLevel: intelligence.risk.metrics.riskScore.level,
        activeNetworkCount: intelligence.networks.metrics.activeNetworkCount,
        totalRevenueUsd: ctx.wallet.financialSummary.totalRevenue,
        totalExpensesUsd: ctx.wallet.financialSummary.totalExpenses,
        netFlowUsd: ctx.wallet.financialSummary.netFlow,
        gasFeesUsd: ctx.wallet.financialSummary.gasFees,
      },
      followup: [
        'review performance to separate price movement from capital movement',
        'review the risk layers behind the health score',
      ],
    });
  },
};

const getPerformanceAnalysis: ToolDefinition = {
  name: 'get_performance_analysis',
  aliases: ['get_portfolio_performance', 'analyze_roi', 'get_roi', 'get_performance'],
  category: 'analysis',
  description:
    'How the portfolio performed over the period: value change, growth, ROI, realized and unrealized P&L, drawdown and recovery, volatility, and the assets that contributed most and least.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();
    return buildEnvelope({
      engine: 'performance',
      tool: 'get_performance_analysis',
      ctx,
      result: intelligence.performance,
      followup: [
        'review capital flows to separate deposits from appreciation',
        'compare this period with the previous window of the same length',
      ],
    });
  },
};

const getFlowAnalysis: ToolDefinition = {
  name: 'get_flow_analysis',
  aliases: ['get_capital_flows', 'analyze_capital_flows', 'get_cashflow'],
  category: 'analysis',
  description:
    'How capital moved: inflows, outflows, net flow, flow velocity and stability, the largest single movements, and the counterparties money came from and went to.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();
    return buildEnvelope({
      engine: 'flow',
      tool: 'get_flow_analysis',
      ctx,
      result: intelligence.flow,
      followup: [
        'inspect the counterparties behind the largest movements',
        'review performance to see how much of the value change came from capital',
      ],
    });
  },
};

const getAssetIntelligence: ToolDefinition = {
  name: 'get_asset_intelligence',
  aliases: ['get_assets_overview', 'analyze_assets', 'get_asset_details'],
  category: 'analysis',
  description:
    'Per-asset behaviour: balance, value, weight, contribution to the portfolio change, classification, lifecycle stage and health. Pass `asset` to focus the analysis on a single symbol.',
  parameters: objectSchema({
    asset: {
      type: 'string',
      description: 'Asset symbol to focus on, e.g. "ETH". Omit for the full asset view.',
    },
  }),
  execute(args, ctx) {
    const intelligence = ctx.getIntelligence();
    const assets = intelligence.assets;
    const symbol = normalizeToken(args.asset);

    if (!symbol) {
      return buildEnvelope({
        engine: 'asset',
        tool: 'get_asset_intelligence',
        ctx,
        result: assets,
        followup: [
          'inspect the largest contributor in isolation',
          'review concentration in the portfolio overview',
        ],
      });
    }

    // Prefer the priced / held row when several ledger entries share a symbol.
    const matches = assets.metrics.assets.filter(
      asset => asset.symbol.toUpperCase() === symbol.toUpperCase(),
    );
    const profile =
      matches.find(asset => asset.held && asset.priceUsd != null && asset.valueUsd > 0) ??
      matches.find(asset => asset.held && asset.valueUsd > 0) ??
      matches.find(asset => asset.valueUsd > 0) ??
      matches[0];

    if (!profile) {
      return buildEnvelope({
        engine: 'asset',
        tool: 'get_asset_intelligence',
        ctx,
        result: assets,
        summary: `No asset matching "${symbol}" is present in the analysed data for this wallet.`,
        metrics: {
          requestedAsset: symbol,
          matched: false,
          availableAssets: assets.metrics.assets.map(asset => asset.symbol),
        },
        patterns: [],
        findings: [],
        evidence: { requested_asset: symbol, assets_available: assets.metrics.assetCount },
        followup: ['review the full asset list before focusing on one symbol'],
      });
    }

    const related = matchesEntity(profile.symbol);
    const screenGrounded = ctx.wallet.intelligenceInput.dataGrounding === 'screen';
    const focusConfidence =
      screenGrounded && profile.priceUsd != null && profile.priceUsd > 0
        ? 'high'
        : screenGrounded && profile.held
          ? 'medium'
          : assets.confidence;

    return buildEnvelope({
      engine: 'asset',
      tool: 'get_asset_intelligence',
      ctx,
      result: assets,
      summary: `${profile.symbol} holds ${formatCompactUsd(profile.valueUsd)} — ${profile.allocationPct.toFixed(1)}% of the ${formatCompactUsd(assets.metrics.portfolioValueUsd)} portfolio — and is classified as ${profile.classification.replace(/_/g, ' ')} in the ${profile.lifecycle} stage.`,
      metrics: {
        requestedAsset: profile.symbol,
        matched: true,
        periodDays: assets.metrics.periodDays,
        portfolioValueUsd: assets.metrics.portfolioValueUsd,
        assetValueUsd: profile.valueUsd,
        allocationPct: profile.allocationPct,
        ...asMetrics(profile),
      },
      patterns: assets.patterns.filter(pattern => evidenceMentions(pattern.evidence, related)),
      findings: assets.insights.filter(
        insight => insight.relatedEntities?.some(related) || evidenceMentions(insight.evidence, related)
      ),
      evidence: {
        asset: profile.symbol,
        value_usd: profile.valueUsd,
        allocation_pct: profile.allocationPct,
        ...(profile.priceUsd != null ? { price_usd: profile.priceUsd } : {}),
        transactions: profile.periodTxCount,
      },
      confidence: focusConfidence,
      followup: [
        'compare this asset against the rest of the portfolio',
        'review the counterparties involved in this asset\u2019s transfers',
      ],
    });
  },
};

const getRiskIntelligence: ToolDefinition = {
  name: 'get_risk_intelligence',
  aliases: ['get_risk_analysis', 'detect_risks', 'analyze_risk'],
  category: 'intelligence',
  description:
    'Structural exposure across six layers — concentration, volatility, liquidity, behavioural, operational and data quality — with the weighted portfolio risk score and the drivers behind each layer. Exposure is described, never judged.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();
    return buildEnvelope({
      engine: 'risk',
      tool: 'get_risk_intelligence',
      ctx,
      result: intelligence.risk,
      followup: [
        'review the allocation behind the concentration layer',
        'review network distribution behind the operational layer',
      ],
    });
  },
};

const getTradingIntelligence: ToolDefinition = {
  name: 'get_trading_intelligence',
  aliases: ['get_trading_statistics', 'analyze_trading', 'analyze_transactions', 'get_trading_volume'],
  category: 'analysis',
  description:
    'Operational behaviour of the wallet: trade count and volume, average and median size, frequency, rotation, turnover, holding time, protocols and networks used, and the resulting trading profile.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();
    return buildEnvelope({
      engine: 'trading',
      tool: 'get_trading_intelligence',
      ctx,
      result: intelligence.trading,
      followup: [
        'review gas cost per network for the same period',
        'compare trade count with the previous window of the same length',
      ],
    });
  },
};

const getNetworkIntelligence: ToolDefinition = {
  name: 'get_network_intelligence',
  aliases: ['get_networks_overview', 'analyze_networks', 'get_chains'],
  category: 'analysis',
  description:
    'How value and activity spread across chains: per-network value, activity share, gas cost and efficiency, dormant and new networks, and the cross-chain profile. Pass `network` to focus on one chain.',
  parameters: objectSchema({
    network: {
      type: 'string',
      description: 'Network key or label to focus on, e.g. "base". Omit for all networks.',
    },
  }),
  execute(args, ctx) {
    const intelligence = ctx.getIntelligence();
    const networks = intelligence.networks;
    const requested = normalizeToken(args.network);

    if (!requested) {
      return buildEnvelope({
        engine: 'network',
        tool: 'get_network_intelligence',
        ctx,
        result: networks,
        followup: [
          'review gas cost relative to volume on the dominant network',
          'review whether value and activity sit on the same chain',
        ],
      });
    }

    const stats = networks.metrics.networks.find(
      entry =>
        entry.network.toLowerCase() === requested.toLowerCase() ||
        entry.label.toLowerCase() === requested.toLowerCase()
    );

    if (!stats) {
      return buildEnvelope({
        engine: 'network',
        tool: 'get_network_intelligence',
        ctx,
        result: networks,
        summary: `No activity or value was recorded on a network matching "${requested}" for this wallet.`,
        metrics: {
          requestedNetwork: requested,
          matched: false,
          availableNetworks: networks.metrics.networks.map(entry => entry.network),
        },
        patterns: [],
        findings: [],
        evidence: { requested_network: requested, networks_available: networks.metrics.networkCount },
        followup: ['review the full network distribution before focusing on one chain'],
      });
    }

    const related = matchesEntity(stats.network, stats.label);

    return buildEnvelope({
      engine: 'network',
      tool: 'get_network_intelligence',
      ctx,
      result: networks,
      summary: `${stats.label} holds ${formatCompactUsd(stats.valueUsd)} — ${stats.allocationPct.toFixed(1)}% of portfolio value — and carries ${stats.activitySharePct.toFixed(1)}% of recorded activity.`,
      metrics: {
        requestedNetwork: stats.network,
        matched: true,
        periodDays: networks.metrics.periodDays,
        portfolioValueUsd: networks.metrics.portfolioValueUsd,
        ...asMetrics(stats),
      },
      patterns: networks.patterns.filter(pattern => evidenceMentions(pattern.evidence, related)),
      findings: networks.insights.filter(
        insight => insight.relatedEntities?.some(related) || evidenceMentions(insight.evidence, related)
      ),
      evidence: {
        network: stats.label,
        value_usd: stats.valueUsd,
        allocation_pct: stats.allocationPct,
        transactions: stats.txCount,
        gas_usd: stats.gasUsd,
      },
      followup: ['compare this chain against the rest of the portfolio'],
    });
  },
};

const getCounterpartyIntelligence: ToolDefinition = {
  name: 'get_counterparty_intelligence',
  aliases: ['get_counterparties', 'analyze_counterparties', 'get_clients'],
  category: 'analysis',
  description:
    'Who the wallet interacts with: addresses classified as exchange, DeFi protocol, bridge, personal, internal or unknown, with interaction counts, volumes, dominance and relationship strength. Pass `counterparty` to focus on one. Addresses are described, never attributed to a person.',
  parameters: objectSchema({
    counterparty: {
      type: 'string',
      description: 'Counterparty display name or address to focus on. Omit for all counterparties.',
    },
  }),
  execute(args, ctx) {
    const intelligence = ctx.getIntelligence();
    const counterparties = intelligence.counterparties;
    const requested = normalizeToken(args.counterparty);

    if (!requested) {
      return buildEnvelope({
        engine: 'counterparty',
        tool: 'get_counterparty_intelligence',
        ctx,
        result: counterparties,
        followup: [
          'inspect the unclassified addresses with the largest movement',
          'review capital flows for the dominant counterparty',
        ],
      });
    }

    const needle = requested.toLowerCase();
    const profile =
      counterparties.metrics.counterparties.find(entry => entry.displayName.toLowerCase() === needle) ??
      counterparties.metrics.counterparties.find(entry => (entry.address ?? '').toLowerCase() === needle) ??
      counterparties.metrics.counterparties.find(entry => entry.displayName.toLowerCase().includes(needle));

    if (!profile) {
      return buildEnvelope({
        engine: 'counterparty',
        tool: 'get_counterparty_intelligence',
        ctx,
        result: counterparties,
        summary: `No counterparty matching "${requested}" was recorded in the analysed data for this wallet.`,
        metrics: {
          requestedCounterparty: requested,
          matched: false,
          availableCounterparties: counterparties.metrics.counterparties.slice(0, 25).map(entry => entry.displayName),
        },
        patterns: [],
        findings: [],
        evidence: {
          requested_counterparty: requested,
          counterparties_available: counterparties.metrics.counterpartyCount,
        },
        followup: ['review the full counterparty list before focusing on one address'],
      });
    }

    const related = matchesEntity(profile.displayName, profile.address ?? undefined);

    return buildEnvelope({
      engine: 'counterparty',
      tool: 'get_counterparty_intelligence',
      ctx,
      result: counterparties,
      summary: `${profile.displayName} accounts for ${formatCompactUsd(profile.totalVolumeUsd)} across ${profile.interactionCount} interactions — ${profile.dominancePct.toFixed(1)}% of recorded movement — and is classified as ${profile.type.replace(/_/g, ' ')}.`,
      metrics: {
        requestedCounterparty: profile.displayName,
        matched: true,
        periodDays: counterparties.metrics.periodDays,
        ...asMetrics(profile),
      },
      patterns: counterparties.patterns.filter(pattern => evidenceMentions(pattern.evidence, related)),
      findings: counterparties.insights.filter(
        insight => insight.relatedEntities?.some(related) || evidenceMentions(insight.evidence, related)
      ),
      evidence: {
        counterparty: profile.displayName,
        type: profile.type,
        volume_usd: profile.totalVolumeUsd,
        interactions: profile.interactionCount,
        dominance_pct: profile.dominancePct,
      },
      followup: ['review the transfers behind this relationship in the flow analysis'],
    });
  },
};

/** Anomaly surfaces map onto the modules that already own the patterns. */
const ANOMALY_SOURCES: Record<AnomalyScope, IntelligenceCategory[]> = {
  transactions: ['risk'],
  flow: ['flow'],
  counterparty: ['counterparty'],
  all: ['risk', 'flow', 'counterparty'],
};

export type AnomalySeverity = 'high' | 'medium' | 'low';

export interface Anomaly {
  type: string;
  severity: AnomalySeverity;
  confidence: Confidence;
  title: string;
  description: string;
  evidence: Evidence;
  relatedEntities: {
    assets?: string[];
    counterparties?: string[];
    networks?: string[];
  };
  detectedBy: 'risk' | 'flow' | 'counterparty';
}

const detectAnomalies: ToolDefinition = {
  name: 'detect_anomalies',
  aliases: ['detect_outliers', 'detect_changes', 'find_anomalies'],
  category: 'intelligence',
  description:
    'Unified anomaly surface (Spec §3.7 group 11). Aggregates and ranks the anomaly patterns that Risk, Flow and Counterparty already detect — it adds no detection logic of its own. Use it for "is this normal?" and "did anything unusual happen?".',
  parameters: objectSchema({
    scope: {
      type: 'string',
      enum: ['transactions', 'flow', 'counterparty', 'all'],
      description: 'Which surface to aggregate. Defaults to "all".',
    },
  }),
  execute(args, ctx) {
    const intelligence = ctx.getIntelligence();
    const scope: AnomalyScope = isAnomalyScope(args.scope) ? args.scope : 'all';
    const sources = ANOMALY_SOURCES[scope];

    const knownNetworks = new Set(
      intelligence.networks.metrics.networks.flatMap(entry => [entry.network.toLowerCase(), entry.label.toLowerCase()])
    );
    const knownAssets = new Set(intelligence.assets.metrics.assets.map(asset => asset.symbol.toLowerCase()));

    const findings = intelligence.insights.filter(
      insight => insight.category !== undefined && sources.includes(insight.category)
    );
    const patterns = intelligence.patterns.filter(pattern => sources.includes(pattern.category));

    const anomalies: Anomaly[] = findings
      .filter(insight => insight.severity !== 'informational')
      .map(insight => ({
        type: insight.type,
        severity: toAnomalySeverity(insight.severity),
        confidence: insight.confidence,
        title: insight.title,
        description: insight.description,
        evidence: insight.evidence,
        relatedEntities: classifyEntities(insight.relatedEntities ?? [], knownAssets, knownNetworks),
        detectedBy: (insight.category ?? 'risk') as Anomaly['detectedBy'],
      }));

    const status: EngineStatus =
      ctx.wallet.coverage.loadedTransactionCount === 0
        ? 'insufficient_data'
        : ctx.wallet.coverage.truncated || intelligence.confidence === 'low'
          ? 'partial'
          : 'completed';

    const summary =
      anomalies.length === 0
        ? `No anomalies were detected across the ${sources.join(', ')} ${sources.length === 1 ? 'surface' : 'surfaces'} in the last ${ctx.wallet.periodDays} days.`
        : `${anomalies.length} ${anomalies.length === 1 ? 'anomaly was' : 'anomalies were'} aggregated from the ${sources.join(', ')} ${sources.length === 1 ? 'surface' : 'surfaces'}: ${countBySeverity(anomalies)}.`;

    return {
      engine: 'anomaly',
      tool: 'detect_anomalies',
      status,
      summary,
      metrics: {
        scope,
        anomalyCount: anomalies.length,
        highSeverityCount: anomalies.filter(item => item.severity === 'high').length,
        mediumSeverityCount: anomalies.filter(item => item.severity === 'medium').length,
        lowSeverityCount: anomalies.filter(item => item.severity === 'low').length,
        patternCount: patterns.length,
        anomalies,
      },
      patterns,
      findings,
      evidence: {
        scope,
        anomalies_detected: anomalies.length,
        patterns_reviewed: patterns.length,
        period_days: ctx.wallet.periodDays,
      },
      confidence: intelligence.confidence,
      dataQuality: toEngineDataQuality(ctx, intelligence),
      recommendedFollowup: dedupe([
        ...(anomalies.length > 0 ? ['inspect the evidence behind the highest-severity anomaly'] : []),
        'compare this period with the previous window of the same length',
        ...(ctx.wallet.coverage.truncated ? ['narrow the period so the analysis fits inside the loaded history'] : []),
      ]),
      periodDays: ctx.wallet.periodDays,
      generatedAt: ctx.wallet.now,
    };
  },
};

export interface WalletAlert {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  category: IntelligenceCategory | 'unknown';
  evidence: Evidence;
  impact?: string;
  impactUsd?: number | null;
  relatedEntities: string[];
  /** Generation instant — alerts are derived per request, not stored. */
  generatedAt: number;
}

const DEFAULT_ALERT_LIMIT = 10;
const MAX_ALERT_LIMIT = 50;

const getWalletAlerts: ToolDefinition = {
  name: 'get_wallet_alerts',
  aliases: ['get_alerts', 'recent_alerts', 'get_notifications'],
  category: 'alert',
  description:
    'What changed and what deserves attention: the ranked insights of the current run, presented as alerts with severity, confidence and evidence. Alerts are derived from the analysis at request time; none are stored.',
  parameters: objectSchema({
    severity: {
      type: 'string',
      enum: ['informational', 'low', 'medium', 'high', 'critical'],
      description: 'Minimum severity to return. Defaults to "low".',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_ALERT_LIMIT,
      description: `Maximum alerts to return. Defaults to ${DEFAULT_ALERT_LIMIT}.`,
    },
  }),
  execute(args, ctx) {
    const intelligence = ctx.getIntelligence();
    const minimum: Severity = isSeverity(args.severity) ? args.severity : 'low';
    const limit = clampLimit(args.limit, DEFAULT_ALERT_LIMIT, MAX_ALERT_LIMIT);

    const alerts: WalletAlert[] = rankInsights(intelligence.insights)
      .filter(insight => severityRank(insight.severity) >= severityRank(minimum))
      .slice(0, limit)
      .map(insight => ({
        id: insight.id,
        type: insight.type,
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        confidence: insight.confidence,
        category: insight.category ?? 'unknown',
        evidence: insight.evidence,
        impact: insight.impact,
        impactUsd: insight.impactUsd ?? null,
        relatedEntities: insight.relatedEntities ?? [],
        generatedAt: ctx.wallet.now,
      }));

    const summary =
      alerts.length === 0
        ? `No observations at ${minimum} severity or above were produced for the last ${ctx.wallet.periodDays} days.`
        : `${alerts.length} ${alerts.length === 1 ? 'observation' : 'observations'} at ${minimum} severity or above over the last ${ctx.wallet.periodDays} days: ${countBySeverityLabel(alerts)}.`;

    return {
      engine: 'alert',
      tool: 'get_wallet_alerts',
      status:
        ctx.wallet.coverage.loadedTransactionCount === 0 && !ctx.wallet.coverage.hasHoldings
          ? 'insufficient_data'
          : ctx.wallet.coverage.truncated || intelligence.confidence === 'low'
            ? 'partial'
            : 'completed',
      summary,
      metrics: {
        alertCount: alerts.length,
        minimumSeverity: minimum,
        totalInsightCount: intelligence.insights.length,
        alerts,
      },
      patterns: [],
      findings: alerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        confidence: alert.confidence,
        evidence: alert.evidence,
        category: alert.category === 'unknown' ? undefined : alert.category,
        impact: alert.impact,
        impactUsd: alert.impactUsd,
        relatedEntities: alert.relatedEntities,
      })),
      evidence: {
        alerts_returned: alerts.length,
        insights_available: intelligence.insights.length,
        minimum_severity: minimum,
        period_days: ctx.wallet.periodDays,
      },
      confidence: intelligence.confidence,
      dataQuality: toEngineDataQuality(ctx, intelligence),
      recommendedFollowup: dedupe([
        ...(alerts.length > 0 ? ['inspect the evidence behind the highest-severity observation'] : []),
        'compare this period with the previous window of the same length',
      ]),
      periodDays: ctx.wallet.periodDays,
      generatedAt: ctx.wallet.now,
    };
  },
};

const generateIntelligenceReport: ToolDefinition = {
  name: 'generate_intelligence_report',
  aliases: ['portfolio_bundle', 'analyze_wallet', 'full_report', 'report_bundle'],
  category: 'intelligence',
  description:
    'The Report Bundle (Spec §3.10): every intelligence module in one call — performance, flow, portfolio, assets, risk, trading, networks and counterparties — merged into a single ranked view. Use it for "analyze my portfolio" and for periodic reports.',
  parameters: NO_PARAMETERS,
  execute(_args, ctx) {
    const intelligence = ctx.getIntelligence();

    return {
      engine: 'report',
      tool: 'generate_intelligence_report',
      status: resolveStatus(ctx, intelligence),
      summary: intelligence.summary,
      metrics: {
        performance: asMetrics(intelligence.performance.metrics),
        flow: asMetrics(intelligence.flow.metrics),
        portfolio: asMetrics(intelligence.portfolio.metrics),
        assets: asMetrics(intelligence.assets.metrics),
        risk: asMetrics(intelligence.risk.metrics),
        trading: asMetrics(intelligence.trading.metrics),
        networks: asMetrics(intelligence.networks.metrics),
        counterparties: asMetrics(intelligence.counterparties.metrics),
      },
      patterns: intelligence.patterns,
      findings: intelligence.insights,
      evidence: {
        portfolio_value_usd: intelligence.portfolio.metrics.totalValueUsd,
        value_change_usd: intelligence.performance.metrics.valueChangeUsd ?? 'unavailable',
        net_flow_usd: intelligence.flow.metrics.netFlowUsd,
        risk_score: intelligence.risk.metrics.riskScore.total,
        trade_count: intelligence.trading.metrics.tradeCount,
        network_count: intelligence.networks.metrics.networkCount,
        counterparty_count: intelligence.counterparties.metrics.counterpartyCount,
        insights: intelligence.insights.length,
        period_days: intelligence.periodDays,
      },
      confidence: intelligence.confidence,
      dataQuality: toEngineDataQuality(ctx, intelligence),
      recommendedFollowup: dedupe([
        'compare this period with the previous window of the same length',
        'inspect the highest-severity finding in its own module',
        ...(ctx.wallet.coverage.truncated ? ['narrow the period so the analysis fits inside the loaded history'] : []),
      ]),
      periodDays: intelligence.periodDays,
      generatedAt: intelligence.generatedAt,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const DEFINITIONS: ToolDefinition[] = [
  getPortfolioOverview,
  getPerformanceAnalysis,
  getFlowAnalysis,
  getAssetIntelligence,
  getRiskIntelligence,
  getTradingIntelligence,
  getNetworkIntelligence,
  getCounterpartyIntelligence,
  detectAnomalies,
  getWalletAlerts,
  generateIntelligenceReport,
];

export const TOOL_REGISTRY: Readonly<Record<ToolName, ToolDefinition>> = Object.freeze(
  DEFINITIONS.reduce((registry, definition) => {
    registry[definition.name] = definition;
    return registry;
  }, {} as Record<ToolName, ToolDefinition>)
);

export const TOOL_NAMES: readonly ToolName[] = DEFINITIONS.map(definition => definition.name);

const ALIAS_INDEX: ReadonlyMap<string, ToolName> = new Map(
  DEFINITIONS.flatMap(definition =>
    [definition.name, ...definition.aliases].map(alias => [alias.toLowerCase(), definition.name] as const)
  )
);

/** Accepts a canonical name or any Spec alias; returns `null` when unknown. */
export function resolveToolName(name: string): ToolName | null {
  return ALIAS_INDEX.get(name.trim().toLowerCase()) ?? null;
}

export function getTool(name: string): ToolDefinition | null {
  const canonical = resolveToolName(name);
  return canonical ? TOOL_REGISTRY[canonical] : null;
}

export function listTools(): ToolDefinition[] {
  return [...DEFINITIONS];
}

/** Function schemas for an OpenAI-compatible `tools` parameter. */
export function listToolSchemas(): Array<{ name: string; description: string; parameters: ToolParameterSchema }> {
  return DEFINITIONS.map(definition => ({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
  }));
}

/** Executes one tool. Never throws: a failure becomes an `insufficient_data` envelope. */
export function runTool(name: string, args: ToolArgs, ctx: ToolContext): EngineOutput {
  const definition = getTool(name);

  if (!definition) {
    return errorEnvelope('unknown', name, ctx, `No tool named "${name}" exists in the Radareum catalog.`);
  }

  try {
    return definition.execute(args, ctx);
  } catch (error) {
    console.error(`[AI Tools] ${definition.name} failed:`, error);
    return errorEnvelope(
      definition.name,
      definition.name,
      ctx,
      `The ${definition.name.replace(/_/g, ' ')} analysis could not be completed for this request.`
    );
  }
}

/** Executes a plan in order, skipping duplicates so a tool never runs twice. */
export function runTools(names: readonly string[], args: ToolArgs, ctx: ToolContext): EngineOutput[] {
  const executed = new Set<ToolName>();
  const outputs: EngineOutput[] = [];

  for (const name of names) {
    const canonical = resolveToolName(name);
    if (!canonical || executed.has(canonical)) continue;
    executed.add(canonical);
    outputs.push(runTool(canonical, args, ctx));
  }

  return outputs;
}

function errorEnvelope(engine: string, tool: string, ctx: ToolContext, message: string): EngineOutput {
  return {
    engine,
    tool: (resolveToolName(tool) ?? 'get_portfolio_overview') as ToolName,
    status: 'insufficient_data',
    summary: message,
    metrics: {},
    patterns: [],
    findings: [],
    evidence: {},
    confidence: 'low',
    dataQuality: {
      transactionCount: ctx.wallet.coverage.visibleTransactionCount,
      pricedCount: 0,
      unpricedCount: 0,
      completeness: 0,
      truncated: ctx.wallet.coverage.truncated,
      notes: [...ctx.wallet.coverage.notes, message],
    },
    recommendedFollowup: [],
    periodDays: ctx.wallet.periodDays,
    generatedAt: ctx.wallet.now,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && value in SEVERITY_RANK;
}

function isAnomalyScope(value: unknown): value is AnomalyScope {
  return value === 'transactions' || value === 'flow' || value === 'counterparty' || value === 'all';
}

function toAnomalySeverity(severity: Severity): AnomalySeverity {
  if (severity === 'critical' || severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function classifyEntities(
  entities: string[],
  knownAssets: ReadonlySet<string>,
  knownNetworks: ReadonlySet<string>
): Anomaly['relatedEntities'] {
  const assets: string[] = [];
  const networks: string[] = [];
  const counterparties: string[] = [];

  for (const entity of entities) {
    const key = entity.trim().toLowerCase();
    if (key.length === 0) continue;
    if (knownAssets.has(key)) assets.push(entity);
    else if (knownNetworks.has(key)) networks.push(entity);
    else counterparties.push(entity);
  }

  const result: Anomaly['relatedEntities'] = {};
  if (assets.length > 0) result.assets = assets;
  if (networks.length > 0) result.networks = networks;
  if (counterparties.length > 0) result.counterparties = counterparties;
  return result;
}

/** Case-insensitive predicate that matches any of the supplied entity spellings. */
function matchesEntity(...names: Array<string | undefined>): (value: string) => boolean {
  const keys = names
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map(name => name.trim().toLowerCase());
  return (value: string) => keys.includes(value.trim().toLowerCase());
}

function evidenceMentions(evidence: Evidence, matches: (value: string) => boolean): boolean {
  for (const value of Object.values(evidence)) {
    if (typeof value === 'string' && matches(value)) return true;
  }
  return false;
}

function countBySeverity(anomalies: Anomaly[]): string {
  const high = anomalies.filter(item => item.severity === 'high').length;
  const medium = anomalies.filter(item => item.severity === 'medium').length;
  const low = anomalies.filter(item => item.severity === 'low').length;
  return `${high} high, ${medium} medium, ${low} low`;
}

function countBySeverityLabel(alerts: WalletAlert[]): string {
  const counts = new Map<Severity, number>();
  for (const alert of alerts) counts.set(alert.severity, (counts.get(alert.severity) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => severityRank(b[0]) - severityRank(a[0]))
    .map(([severity, count]) => `${count} ${severity}`)
    .join(', ');
}

function clampLimit(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(value => value.length > 0))];
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return 'an unavailable amount';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  return `${sign}$${abs.toFixed(2)}`;
}
