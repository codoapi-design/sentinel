/**
 * Sentinel AI — Agent Runtime
 *
 * The pipeline every AI surface goes through (Part 2 §2.17 Golden Pipeline):
 *
 *   load context → plan tools → execute tools → merge envelopes →
 *   generate narrative
 *
 * Two properties hold everywhere:
 *
 * - **The LLM is optional.** With no `OPENAI_API_KEY` the deterministic
 *   renderer produces the full narrative from the same envelopes. Nothing else
 *   changes: same tools, same numbers, same confidence.
 * - **The model never reaches the database.** It receives tool output only,
 *   which this module produced through the business tool layer.
 */

import {
  formatPeriodLabel,
  formatSinceConnectedLabel,
  daysSinceConnected,
  lowestConfidence,
  rankInsights,
  type Confidence,
  type Evidence,
  type Insight,
  type MetricUnit,
  type Pattern,
} from '@/lib/ai/intelligence';
import {
  generateNarrative,
  type AgentMode,
  type ChatMessage,
  type GuardrailViolation,
  type LlmUsage,
  type NarrativeIntelligence,
  type NarrativeSource,
  type RuntimeContext,
} from '@/lib/ai/llm';
import { humanizeKey } from '@/lib/ai/llm/render';

import {
  isAllTimeUiPeriod,
  loadWalletContext,
  type WalletContext,
  type WalletProfile,
} from './context';
import {
  createToolContext,
  runTools,
  type EngineOutput,
  type EngineStatus,
  type ToolArgs,
  type ToolName,
} from './registry';
import { MAX_TOOLS_PER_QUESTION, planTools, type AnalysisMode, type PageContext, type ToolPlan } from './planner';

export * from './bundles';
export * from './context';
export * from './planner';
export * from './registry';
export * from './usage';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Where the request came from: the page, section and filters the user sees. */
export interface SectionContext {
  sectionType?: string | null;
  sectionTitle?: string | null;
  page?: string | null;
  asset?: string | null;
  network?: string | null;
  counterparty?: string | null;
  /** Transaction-type filter id from the type detail pages. */
  typeId?: string | null;
  period?: string | number | null;
  filters?: Record<string, string | number | boolean | null> | null;
}

export interface RunAnalysisArgs {
  walletId: string;
  userId: string;
  /** Response channel and length budget (Part 7 §7.8). */
  mode: AgentMode;
  /** The user's question. Absent for the "AI Data Analysis" button. */
  question?: string | null;
  history?: ChatMessage[];
  sectionContext?: SectionContext;
  includeHidden?: boolean;
  /** Evaluation instant in epoch ms; pass it to make a request reproducible. */
  now?: number;
  signal?: AbortSignal;
  /** Forces the deterministic renderer even when a key is configured. */
  preferDeterministic?: boolean;
  user?: { plan?: string | null; locale?: string | null; timezone?: string | null };
  /** Already-loaded context, to avoid reading the same wallet twice. */
  context?: WalletContext;
}

export interface AnalysisMetric {
  engine: string;
  key: string;
  label: string;
  value: number | string | boolean;
  unit: MetricUnit | 'text';
}

export interface AnalysisInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: Insight['severity'];
  confidence: Confidence;
  category: string | null;
  evidence: Insight['evidence'];
  impact: string | null;
  impactUsd: number | null;
  relatedEntities: string[];
}

export interface AnalysisDataQuality {
  transactionCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** 0–100 share of rows that carried a usable USD amount. */
  completeness: number;
  /** True when the wallet has more history than one analysis reads. */
  truncated: boolean;
  transactionCap: number;
  loadedTransactionCount: number;
  totalTransactionCount: number | null;
  syncStatus: WalletProfile['syncStatus'];
  lastSyncedAt: string | null;
  /** Neutral statements about what limits this analysis. */
  notes: string[];
}

export interface RunAnalysisResult {
  narrative: string;
  source: NarrativeSource;
  /** One Unified Engine Output envelope per executed tool (Spec §5.0.6.1). */
  intelligence: EngineOutput[];
  insights: AnalysisInsight[];
  metrics: AnalysisMetric[];
  patterns: Pattern[];
  toolsUsed: ToolName[];
  plan: ToolPlan;
  analysisMode: AnalysisMode;
  confidence: Confidence;
  dataQuality: AnalysisDataQuality;
  wallet: WalletProfile;
  periodDays: number;
  periodLabel: string;
  generatedAt: number;
  llm: {
    providerId: string;
    model?: string;
    usage?: LlmUsage;
    /** Present whenever the LLM path was available but not used. */
    fallbackReason?: string;
    violations: GuardrailViolation[];
  };
  /** The loaded context, so a caller can reuse it without a second read. */
  context: WalletContext;
}

const MAX_INSIGHTS = 15;
const MAX_METRICS = 80;
/** Per-engine budget, so a metric-rich module cannot starve the others. */
const MAX_METRICS_PER_ENGINE = 20;

/** Section titles used when an envelope is handed to the narrative layer. */
const ENGINE_TITLES: Record<string, string> = {
  performance: 'Performance',
  flow: 'Capital Flow',
  portfolio: 'Portfolio',
  asset: 'Assets',
  risk: 'Risk',
  trading: 'Trading',
  network: 'Networks',
  counterparty: 'Counterparties',
  anomaly: 'Anomalies',
  alert: 'Alerts',
  report: 'Full Intelligence Report',
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs one complete analysis for a wallet and returns both the narrative and
 * the structured intelligence behind it.
 *
 * @throws {WalletContextError} when the wallet does not belong to the user.
 */
export async function runAnalysis(args: RunAnalysisArgs): Promise<RunAnalysisResult> {
  const section = args.sectionContext ?? {};
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  const investmentReturnFocus = isInvestmentReturnSection(section);

  // Planned twice on purpose: the first pass is free and decides which heavy
  // sources are worth loading; the second refines entity extraction with the
  // symbols and networks the wallet actually has.
  const provisionalPlan = planTools(question, toPageContext(section));

  let context =
    args.context ??
    (await loadWalletContext({
      walletId: args.walletId,
      userId: args.userId,
      period: section.period ?? null,
      includeHidden: args.includeHidden,
      now: args.now,
      scope: resolveScope(provisionalPlan.tools),
      analysisFocus: investmentReturnFocus ? 'investment_return' : undefined,
    }));

  context = applyInvestmentReturnFocus(context, section);

  const plan = planTools(question, toPageContext(section, context));
  const toolContext = createToolContext(context);
  const toolArgs = toToolArgs(plan, section);
  const envelopes = runTools(plan.tools, toolArgs, toolContext);

  const periodLabel = context.periodLabel || formatPeriodLabel(context.periodDays);
  const sectionLabel = resolveSectionLabel(section, plan);

  const narrativeModules = envelopes.map(envelope => toNarrativeIntelligence(envelope, periodLabel));

  const usesFullReport = plan.tools.includes('generate_intelligence_report');
  const narrative = await generateNarrative({
    mode: args.mode,
    runtimeContext: buildRuntimeContext(args, context, section),
    intelligence: narrativeModules,
    userMessage: question.length > 0 ? question : undefined,
    history: args.history,
    section: sectionLabel,
    period: periodLabel,
    signal: args.signal,
    preferDeterministic: args.preferDeterministic,
    // Full executive reports use AI_MODEL_REPORT (gpt-4o); everything else uses AI_MODEL.
    purpose: usesFullReport ? 'report' : 'default',
    now: new Date(context.now),
  });

  return {
    narrative: narrative.text,
    source: narrative.source,
    intelligence: envelopes,
    insights: collectInsights(envelopes),
    metrics: collectMetrics(envelopes),
    patterns: collectPatterns(envelopes),
    toolsUsed: envelopes.map(envelope => envelope.tool),
    plan,
    analysisMode: plan.mode,
    confidence: mergeConfidence(envelopes),
    dataQuality: buildDataQuality(envelopes, context),
    wallet: context.wallet,
    periodDays: context.periodDays,
    periodLabel,
    generatedAt: context.now,
    llm: {
      providerId: narrative.providerId,
      model: narrative.model,
      usage: narrative.usage,
      fallbackReason: narrative.fallbackReason,
      violations: narrative.violations,
    },
    context,
  };
}

// ---------------------------------------------------------------------------
// Planning inputs
// ---------------------------------------------------------------------------

function toPageContext(section: SectionContext, context?: WalletContext): PageContext {
  return {
    sectionType: section.sectionType ?? null,
    page: section.page ?? null,
    asset: section.asset ?? null,
    network: section.network ?? null,
    counterparty: section.counterparty ?? null,
    period: typeof section.period === 'string' ? section.period : null,
    knownAssets: context ? [...new Set(context.assets.map(asset => asset.symbol).filter(Boolean))] : undefined,
    knownNetworks: context ? context.wallet.networks : undefined,
  };
}

function toToolArgs(plan: ToolPlan, section: SectionContext): ToolArgs {
  return {
    asset: plan.entities.asset ?? section.asset ?? undefined,
    network: plan.entities.network ?? section.network ?? undefined,
    counterparty: plan.entities.counterparty ?? section.counterparty ?? undefined,
    scope: 'all',
  };
}

/**
 * Heavy sources are loaded only when a planned tool actually reports them:
 * cost-basis reconstruction and trade-level volume each cost extra queries.
 */
function resolveScope(tools: readonly ToolName[]): { investmentReturn: boolean; tradingVolume: boolean } {
  const planned = new Set(tools);
  return {
    investmentReturn:
      planned.has('get_performance_analysis') ||
      planned.has('get_portfolio_overview') ||
      planned.has('generate_intelligence_report'),
    tradingVolume: planned.has('get_trading_intelligence') || planned.has('generate_intelligence_report'),
  };
}

function resolveSectionLabel(section: SectionContext, plan: ToolPlan): string {
  const explicit = (section.sectionTitle ?? '').trim();
  if (explicit.length > 0) return explicit;

  const type = (section.sectionType ?? section.page ?? '').trim();
  if (type.length > 0) return humanizeKey(type);

  return plan.entities.asset ?? plan.entities.network ?? 'Portfolio';
}

function normalizeSectionKey(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function isInvestmentReturnSection(section: SectionContext): boolean {
  const keys = [section.sectionType, section.page].map(normalizeSectionKey);
  return keys.some(key => key === 'investment-return' || key === 'roi');
}

/**
 * Ensures Investment Return analyses carry IR focus, since-connected period
 * labels, and no contradictory "730d / empty holdings" framing — including when
 * a preloaded `WalletContext` was passed in.
 */
function applyInvestmentReturnFocus(context: WalletContext, section: SectionContext): WalletContext {
  if (!isInvestmentReturnSection(section)) {
    if (!context.periodLabel) {
      return { ...context, periodLabel: formatPeriodLabel(context.periodDays) };
    }
    return context;
  }

  let periodDays = context.periodDays;
  let periodLabel = context.periodLabel || formatPeriodLabel(periodDays);
  const ir = context.investmentReturn;

  if (isAllTimeUiPeriod(section.period) && ir?.sinceConnectedAt) {
    const sinceDays = daysSinceConnected(ir.sinceConnectedAt, context.now);
    if (sinceDays != null) {
      periodDays = sinceDays;
      periodLabel =
        formatSinceConnectedLabel(ir.sinceConnectedAt, context.now) ??
        `Since connected (${periodDays}d)`;
    }
  }

  return {
    ...context,
    periodDays,
    periodLabel,
    intelligenceInput: {
      ...context.intelligenceInput,
      analysisFocus: 'investment_return',
      periodDays,
      periodLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime context (Part 7 §7.5)
// ---------------------------------------------------------------------------

function buildRuntimeContext(
  args: RunAnalysisArgs,
  context: WalletContext,
  section: SectionContext
): RuntimeContext {
  const investmentReturnFocus = isInvestmentReturnSection(section);
  const periodLabel = context.periodLabel || formatPeriodLabel(context.periodDays);

  return {
    user: {
      id: args.userId,
      plan: args.user?.plan ?? undefined,
      locale: args.user?.locale ?? undefined,
      timezone: args.user?.timezone ?? undefined,
    },
    wallet: {
      id: context.wallet.id,
      label: context.wallet.label,
      addressMasked: context.wallet.addressMasked ?? undefined,
      networks: context.wallet.networks,
      connectedAt: context.wallet.connectedAt ?? undefined,
      lastSyncedAt: context.wallet.lastSyncedAt ?? undefined,
      syncStatus: context.wallet.syncStatus,
    },
    portfolio: {
      totalValueUsd: context.portfolioValueUsd,
      assetCount: context.assets.length,
      currency: 'USD',
    },
    session: {
      channel: args.mode,
      currentPage: section.page ?? undefined,
      currentSection: investmentReturnFocus
        ? 'Investment Return (mark-to-market vs lot cost basis since wallet connect — not current holdings composition)'
        : section.sectionTitle ?? section.sectionType ?? undefined,
      selectedPeriod: periodLabel,
      activeFilters: buildActiveFilters(section),
      now: new Date(context.now).toISOString(),
    },
    capabilities: {
      // Tools are executed deterministically by the planner before the model
      // is called, so the model itself has no tool-calling surface.
      toolsEnabled: false,
      reportsEnabled: true,
      maxToolCalls: MAX_TOOLS_PER_QUESTION,
    },
  };
}

function buildActiveFilters(section: SectionContext): Record<string, string | number | boolean | null> | undefined {
  const filters: Record<string, string | number | boolean | null> = { ...(section.filters ?? {}) };

  if (section.asset) filters.asset = section.asset;
  if (section.network) filters.network = section.network;
  if (section.counterparty) filters.counterparty = section.counterparty;
  if (section.typeId) filters.type = section.typeId;

  return Object.keys(filters).length > 0 ? filters : undefined;
}

// ---------------------------------------------------------------------------
// Envelope → narrative input
// ---------------------------------------------------------------------------

function toNarrativeIntelligence(envelope: EngineOutput, periodLabel: string): NarrativeIntelligence {
  return {
    module: envelope.engine,
    title: ENGINE_TITLES[envelope.engine] ?? humanizeKey(envelope.engine),
    summary: envelope.summary,
    period: periodLabel,
    metrics: envelope.metrics,
    patterns: envelope.patterns.map(pattern => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      confidence: pattern.confidence,
    })),
    insights: envelope.findings.map(finding => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      confidence: finding.confidence,
      evidence: finding.evidence,
    })),
    evidence: envelope.evidence,
    monitoringPoints: envelope.recommendedFollowup,
    dataQuality: {
      level: envelope.confidence,
      completeness: envelope.dataQuality.completeness * 100,
      issues: envelope.dataQuality.notes,
    },
    confidence: envelope.confidence,
  };
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

function collectInsights(envelopes: EngineOutput[]): AnalysisInsight[] {
  const findings = envelopes.flatMap(envelope => envelope.findings);

  return rankInsights(findings)
    .slice(0, MAX_INSIGHTS)
    .map(insight => ({
      id: insight.id,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      severity: insight.severity,
      confidence: insight.confidence,
      category: insight.category ?? null,
      evidence: insight.evidence,
      impact: insight.impact ?? null,
      impactUsd: insight.impactUsd ?? null,
      relatedEntities: insight.relatedEntities ?? [],
    }));
}

function collectPatterns(envelopes: EngineOutput[]): Pattern[] {
  const seen = new Set<string>();
  const patterns: Pattern[] = [];

  for (const envelope of envelopes) {
    for (const pattern of envelope.patterns) {
      if (seen.has(pattern.id)) continue;
      seen.add(pattern.id);
      patterns.push(pattern);
    }
  }

  return patterns;
}

/**
 * Flattens engine metrics into labelled scalars for the UI. Nested groups are
 * descended one level, which is what the report bundle needs; arrays and
 * deeper structures stay in `intelligence` for callers that want them.
 */
function collectMetrics(envelopes: EngineOutput[]): AnalysisMetric[] {
  const metrics: AnalysisMetric[] = [];
  const seen = new Set<string>();

  for (const envelope of envelopes) {
    const budget = metrics.length + MAX_METRICS_PER_ENGINE;

    for (const [key, value] of Object.entries(envelope.metrics)) {
      if (metrics.length >= MAX_METRICS) return metrics;
      if (metrics.length >= budget) break;

      if (isScalar(value)) {
        pushMetric(metrics, seen, envelope.engine, key, value);
        continue;
      }

      if (isPlainObject(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (metrics.length >= MAX_METRICS || metrics.length >= budget) break;
          if (!isScalar(nestedValue)) continue;
          pushMetric(metrics, seen, `${envelope.engine}.${key}`, nestedKey, nestedValue);
        }
      }
    }
  }

  return metrics;
}

function pushMetric(
  metrics: AnalysisMetric[],
  seen: Set<string>,
  engine: string,
  key: string,
  value: number | string | boolean
): void {
  const id = `${engine}:${key}`;
  if (seen.has(id)) return;
  seen.add(id);
  metrics.push({ engine, key, label: humanizeKey(key), value, unit: inferUnit(key, value) });
}

const USD_KEY = /(usd|value|pnl|profit|loss|volume|fee|fees|cost|flow|deposits|withdrawals|balance)$/i;
const PCT_KEY = /(pct|percent|percentage|roi|share|weight|allocation|concentration|rate|growth|drawdown)$/i;
const DAYS_KEY = /(days|duration)$/i;
const SCORE_KEY = /(score|index)$/i;
const RATIO_KEY = /(ratio|velocity)$/i;
const COUNT_KEY = /(count|assets|networks|trades|transactions|transfers|interactions|alerts|anomalies)$/i;

function inferUnit(key: string, value: number | string | boolean): MetricUnit | 'text' {
  if (typeof value !== 'number') return 'text';
  if (PCT_KEY.test(key)) return 'pct';
  if (USD_KEY.test(key)) return 'usd';
  if (DAYS_KEY.test(key)) return 'days';
  if (SCORE_KEY.test(key)) return 'score';
  if (RATIO_KEY.test(key)) return 'ratio';
  if (COUNT_KEY.test(key)) return 'count';
  return Number.isInteger(value) ? 'count' : 'score';
}

function mergeConfidence(envelopes: EngineOutput[]): Confidence {
  if (envelopes.length === 0) return 'low';
  return lowestConfidence(...envelopes.map(envelope => envelope.confidence));
}

function buildDataQuality(envelopes: EngineOutput[], context: WalletContext): AnalysisDataQuality {
  const measured =
    envelopes.find(envelope => envelope.dataQuality.transactionCount > 0)?.dataQuality ??
    envelopes[0]?.dataQuality;

  return {
    transactionCount: measured?.transactionCount ?? context.coverage.visibleTransactionCount,
    pricedCount: measured?.pricedCount ?? 0,
    unpricedCount: measured?.unpricedCount ?? 0,
    completeness: Math.round((measured?.completeness ?? 0) * 10000) / 100,
    truncated: context.coverage.truncated,
    transactionCap: context.coverage.transactionCap,
    loadedTransactionCount: context.coverage.loadedTransactionCount,
    totalTransactionCount: context.coverage.totalTransactionCount,
    syncStatus: context.wallet.syncStatus,
    lastSyncedAt: context.wallet.lastSyncedAt,
    notes: context.coverage.notes,
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Envelope without its metric payload — safe to return over the wire. */
export interface EngineSummary {
  engine: string;
  tool: ToolName;
  status: EngineStatus;
  summary: string;
  confidence: Confidence;
  evidence: Evidence;
  recommendedFollowup: string[];
}

/**
 * Compact view of the intelligence an answer was built on. Metric bags stay
 * out of API responses: they can hold thousands of rows, and the flattened
 * `metrics` list already carries the figures a UI needs.
 */
export function summarizeIntelligence(envelopes: EngineOutput[]): EngineSummary[] {
  return envelopes.map(envelope => ({
    engine: envelope.engine,
    tool: envelope.tool,
    status: envelope.status,
    summary: envelope.summary,
    confidence: envelope.confidence,
    evidence: envelope.evidence,
    recommendedFollowup: envelope.recommendedFollowup,
  }));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isScalar(value: unknown): value is number | string | boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  return typeof value === 'boolean';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
