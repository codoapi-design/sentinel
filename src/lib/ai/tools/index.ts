/**
 * Radareum AI — Agent Runtime
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
  applyScreenSnapshot,
  parsePeriodDays,
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
import type { AiScreenSnapshot } from '@/lib/ai-screen-snapshot';
import {
  AiRequestTracer,
  PIPELINE_VERSION,
  RESPONSE_SCHEMA_VERSION,
  ENGINE_VERSIONS,
  buildAnalysisScope,
  buildDataRequirementsPlan,
  collectApprovedNumerics,
  deriveCompletionStatus,
  evaluateEligibility,
  filterProhibitedFindings,
  normalizeAllFindings,
  verifyScreenAgainstServer,
  splitScreenSnapshot,
  resolveAiHistoryEntitlement,
  intersectPeriodWithEntitlement,
  periodBounds,
  type AnalysisCompletionStatus,
  type AnalysisScope,
  type DomainStatus,
  type EvidenceItem,
  type GroundingReport,
  type NarrativeValidationReport,
  type NormalizedFinding,
  type StructuredNarrative,
  type AiVersions,
  type DataRequirementsPlan,
} from '@/lib/ai/trust';
import { createAiAnalysisJob } from '@/lib/ai/jobs';
import {
  runIntelligenceQuality,
  serializeForLlm,
  toPublicReasonedIntelligence,
  resolvePolicyContext,
  type PublicReasonedIntelligence,
  type ReasoningDiagnostics,
} from '@/lib/ai/intelligence-quality';
import { RADAREUM_PROMPT_VERSION } from '@/lib/ai/llm/prompts';
import { finalizeMemoryAfterAnalysis, prepareMemoryForRequest } from '@/lib/ai/memory';
import { SubscriptionEntitlementError } from './usage';

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
  /**
   * On-screen rows from the Analyze button. When set, those slices replace the
   * matching DB data. Chat must omit this so the agent searches the full wallet.
   */
  screenSnapshot?: AiScreenSnapshot | null;
  /** Package 3 conversation id for continuity. */
  conversationId?: string | null;
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
  isFullEntitledHistory?: boolean;
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
  /** Package 1 additive fields */
  completionStatus: AnalysisCompletionStatus;
  structuredNarrative?: StructuredNarrative;
  scope: AnalysisScope;
  domainStatuses: DomainStatus[];
  grounding: GroundingReport;
  evidence: EvidenceItem[];
  normalizedFindings: NormalizedFinding[];
  validation?: NarrativeValidationReport;
  traceId: string;
  versions: AiVersions;
  dataRequirementsPlan: DataRequirementsPlan;
  /** Present when heavy full-history work was deferred to a durable job. */
  jobId?: string;
  entitlementLimitations?: string[];
  /** Package 2 reasoned intelligence (public subset). */
  reasonedIntelligence?: PublicReasonedIntelligence;
  /** Package 2 diagnostics — only when explicitly enabled. */
  reasoningDiagnostics?: ReasoningDiagnostics;
  /** Package 3 conversation / analysis persistence. */
  conversationId?: string | null;
  persistedAnalysisId?: string | null;
  historicalWhatMatters?: {
    mainChange?: string;
    newIssues?: string[];
    worseningIssues?: string[];
    improvingIssues?: string[];
    resolvedIssues?: string[];
  } | null;
  memoryUsed?: {
    conversation: boolean;
    preferences: string[];
    previousAnalysis: boolean;
    lifecycleRecords: number;
  };
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
  const tracer = new AiRequestTracer();
  const section = args.sectionContext ?? {};
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  const investmentReturnFocus = isInvestmentReturnSection(section);
  const now = args.now ?? Date.now();
  const periodDaysHint = parsePeriodDays(section.period ?? null);

  const entitlement = resolveAiHistoryEntitlement({
    plan: args.user?.plan,
    now,
  });
  const requestedBounds = periodBounds(periodDaysHint, now);
  const periodIntersection = intersectPeriodWithEntitlement(requestedBounds, entitlement);
  if (periodIntersection.denied) {
    throw new SubscriptionEntitlementError(
      periodIntersection.reason ?? 'Requested period is outside subscription entitlement.',
    );
  }

  tracer.markStart('plannerMs');
  // Planned twice on purpose: the first pass is free and decides which heavy
  // sources are worth loading; the second refines entity extraction with the
  // symbols and networks the wallet actually has.
  const provisionalPlan = planTools(question, toPageContext(section));
  let dataRequirementsPlan = buildDataRequirementsPlan({
    plan: provisionalPlan,
    question,
    periodDays: periodDaysHint,
    now,
    entity: {
      asset: section.asset,
      network: section.network,
      counterparty: section.counterparty,
    },
  });

  // Enforce entitlement: full-history async only when plan allows.
  if (
    dataRequirementsPlan.transactions.mode === 'full_entitled_history' &&
    !entitlement.asyncFullHistoryAvailable
  ) {
    dataRequirementsPlan = {
      ...dataRequirementsPlan,
      transactions: {
        mode: 'aggregate',
        metrics: ['tx_count', 'inflow_usd', 'outflow_usd', 'net_flow_usd'],
        from: periodIntersection.from,
        to: periodIntersection.to,
      },
    };
  }
  tracer.markEnd('plannerMs');

  // Heavy full-history row processing → durable job (never fake complete).
  let jobId: string | undefined;
  if (
    dataRequirementsPlan.transactions.mode === 'full_entitled_history' &&
    entitlement.asyncFullHistoryAvailable
  ) {
    const job = await createAiAnalysisJob({
      userId: args.userId,
      walletId: args.walletId,
      jobType: 'full_history_analysis',
      requestedScope: {
        from: periodIntersection.from,
        to: periodIntersection.to,
        asset: section.asset ?? undefined,
        network: section.network ?? undefined,
      },
      entitlementScope: {
        allowedFrom: entitlement.allowedFrom,
        allowedTo: entitlement.allowedTo,
        plan: entitlement.plan,
        limitations: entitlement.limitations,
      },
      traceId: tracer.traceId,
    });
    jobId = job.id;

    const versions: AiVersions = {
      pipelineVersion: PIPELINE_VERSION,
      responseSchemaVersion: RESPONSE_SCHEMA_VERSION,
      promptVersion: RADAREUM_PROMPT_VERSION,
      engineVersions: ENGINE_VERSIONS,
    };
    const scope = buildAnalysisScope({
      walletId: args.walletId,
      periodPreset: section.period,
      periodDays: periodDaysHint,
      now,
      plan: entitlement.plan,
      source: 'server_aggregate',
      truncated: true,
      isFullEntitledHistory: false,
      truncationReason: 'Full entitled history requires durable job processing',
      entitlementLimitations: [
        ...entitlement.limitations,
        ...(periodIntersection.clipped ? [periodIntersection.reason ?? 'Period clipped.'] : []),
        `Analysis job ${job.id} queued for exact full-history processing.`,
      ],
    });

    return {
      narrative:
        'Full entitled history analysis is processing asynchronously. Poll the job status endpoint for exact completion coverage.',
      source: 'deterministic',
      intelligence: [],
      insights: [],
      metrics: [],
      patterns: [],
      toolsUsed: [],
      plan: provisionalPlan,
      analysisMode: provisionalPlan.mode,
      confidence: 'low',
      dataQuality: {
        transactionCount: 0,
        pricedCount: 0,
        unpricedCount: 0,
        completeness: 0,
        truncated: true,
        transactionCap: 0,
        loadedTransactionCount: 0,
        totalTransactionCount: null,
        syncStatus: 'never',
        lastSyncedAt: null,
        notes: [`Pending job ${job.id}`],
        isFullEntitledHistory: false,
      },
      wallet: {
        id: args.walletId,
        label: 'Wallet',
        addressMasked: null,
        addresses: [],
        networks: [],
        connectedAt: null,
        lastSyncedAt: null,
        isSyncing: false,
        syncStatus: 'never',
      },
      periodDays: periodDaysHint,
      periodLabel: formatPeriodLabel(periodDaysHint),
      generatedAt: now,
      llm: { providerId: 'none', violations: [] },
      context: (args.context ?? ({
        wallet: {
          id: args.walletId,
          label: 'Wallet',
          addressMasked: null,
          addresses: [],
          networks: [],
          connectedAt: null,
          lastSyncedAt: null,
          isSyncing: false,
          syncStatus: 'never',
        },
        transactions: [],
        visibleTransactions: [],
        assets: [],
        clients: [],
        snapshots: [],
        portfolioValueUsd: 0,
        financialSummary: {
          totalRevenue: 0,
          totalExpenses: 0,
          netFlow: 0,
          gasFees: 0,
          tradingVolume: 0,
          transactionCount: 0,
          pricedCashflowCount: 0,
          unpricedCount: 0,
          excludedActivityCount: 0,
          methodology: 'pending_job',
        },
        investmentReturn: null,
        tradingVolume: null,
        ethPriceUsd: null,
        periodDays: periodDaysHint,
        periodLabel: formatPeriodLabel(periodDaysHint),
        includeHidden: false,
        now,
        coverage: {
          loadedTransactionCount: 0,
          totalTransactionCount: null,
          visibleTransactionCount: 0,
          transactionCap: 0,
          truncated: true,
          isFullEntitledHistory: false,
          hasSnapshots: false,
          hasHoldings: false,
          notes: [`Pending job ${job.id}`],
        },
        intelligenceInput: {
          transactions: [],
          assets: [],
          clients: [],
          now,
          periodDays: periodDaysHint,
        },
        domainStatuses: [],
      } satisfies WalletContext)),
      completionStatus: 'pending',
      structuredNarrative: {
        schemaVersion: '2.0.0',
        headline: 'Analysis pending',
        summary: `Full-history job ${job.id} is queued.`,
        selectedFindingIds: [],
        interpretation: '',
        monitoringPoints: ['Poll /api/ai/jobs for progress based on processed records.'],
        limitations: entitlement.limitations,
        language: 'en',
      },
      scope,
      domainStatuses: [],
      grounding: {
        primarySource: 'server_database',
        screenContextUsed: false,
        screenValuesVerified: true,
        discrepancies: [],
      },
      evidence: [],
      normalizedFindings: [],
      validation: { valid: true, checkedClaims: 0, matchedClaims: 0, unmatchedClaims: [], correctionsApplied: [] },
      traceId: tracer.traceId,
      versions,
      dataRequirementsPlan,
      jobId,
      entitlementLimitations: entitlement.limitations,
    };
  }

  tracer.markStart('contextMs');
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
      dataRequirements: dataRequirementsPlan,
    }));

  let grounding: GroundingReport = {
    primarySource: 'server_database',
    screenContextUsed: false,
    screenValuesVerified: true,
    discrepancies: [],
  };

  // Analyze button only: presentation context + verification; server authoritative.
  if (args.screenSnapshot) {
    const { presentation, clientValues } = splitScreenSnapshot(args.screenSnapshot);
    grounding = verifyScreenAgainstServer(context, clientValues, presentation);
    context = applyScreenSnapshot(context, args.screenSnapshot);
  }
  tracer.markEnd('contextMs');

  context = applyInvestmentReturnFocus(context, section);

  tracer.markStart('plannerMs');
  const plan = planTools(question, toPageContext(section, context));
  tracer.markEnd('plannerMs');

  const domainStatuses: DomainStatus[] = context.domainStatuses ?? [];
  const eligibility = evaluateEligibility(domainStatuses);

  // Drop tools that require prohibited domains
  let tools = [...plan.tools];
  if (!eligibility.allowFlow) {
    tools = tools.filter(
      t =>
        t !== 'get_flow_analysis' &&
        t !== 'get_counterparty_intelligence' &&
        t !== 'get_trading_intelligence',
    );
  }
  if (!eligibility.allowHoldings) {
    tools = tools.filter(
      t =>
        t !== 'get_portfolio_overview' &&
        t !== 'get_asset_intelligence' &&
        t !== 'get_risk_intelligence',
    );
  }
  if (tools.length === 0 && eligibility.allowHoldings) {
    tools = ['get_portfolio_overview'];
  }

  tracer.markStart('enginesMs');
  const toolContext = createToolContext(context);
  const toolArgs = toToolArgs({ ...plan, tools }, section);
  const envelopes = runTools(tools, toolArgs, toolContext);
  tracer.markEnd('enginesMs');

  const periodLabel = context.periodLabel || formatPeriodLabel(context.periodDays);
  const sectionLabel = resolveSectionLabel(section, plan);

  const scope = buildAnalysisScope({
    walletId: args.walletId,
    periodPreset: section.period,
    periodDays: context.periodDays,
    now: context.now,
    plan: args.user?.plan,
    entity: {
      asset: plan.entities.asset ?? section.asset,
      network: plan.entities.network ?? section.network,
      counterparty: plan.entities.counterparty ?? section.counterparty,
      transactionType: section.typeId,
    },
    filters: section.filters,
    source: grounding.primarySource,
    processedRecords: context.coverage.loadedTransactionCount,
    matchingRecords: context.coverage.totalTransactionCount,
    truncated: context.coverage.truncated,
    truncationReason: context.coverage.truncationReason,
    isFullEntitledHistory: context.coverage.isFullEntitledHistory === true,
    asOf: {
      holdings: context.wallet.lastSyncedAt ?? undefined,
      transactions: context.transactionAggregates?.asOf,
      pricing: context.wallet.lastSyncedAt ?? undefined,
    },
    entitlementLimitations: eligibility.limitations,
  });

  const rawInsights = collectInsights(envelopes).map(i => ({
    ...i,
    engine: envelopes.find(e => e.findings.some(f => f.id === i.id))?.engine,
  }));
  const allowedInsights = filterProhibitedFindings(rawInsights, eligibility);
  const { evidence, findings: normalizedFindings } = normalizeAllFindings(
    allowedInsights.map(i => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
      severity: i.severity,
      confidence: i.confidence,
      category: i.category ?? undefined,
      evidence: i.evidence,
      impact: i.impact ?? undefined,
      impactUsd: i.impactUsd ?? undefined,
      relatedEntities: i.relatedEntities,
      engine: i.engine,
    })) as Parameters<typeof normalizeAllFindings>[0],
    scope,
  );

  const metrics = collectMetrics(envelopes);
  const narrativeModules = envelopes.map(envelope => toNarrativeIntelligence(envelope, periodLabel));
  const approvedNumerics = collectApprovedNumerics({
    metrics: metrics.map(m => ({
      value: m.value,
      key: m.key,
      label: m.label,
      unit: String(m.unit),
    })),
    evidenceValues: evidence.map(e => e.value),
    portfolioValueUsd: context.portfolioValueUsd,
  });

  // Package 2 — deterministic reasoning / ranking before LLM
  tracer.markStart('reasoningMs');
  const relevanceContext =
    args.mode === 'chat'
      ? 'chat'
      : tools.includes('generate_intelligence_report')
        ? 'report'
        : resolvePolicyContext(section.sectionType ?? section.page);
  const includeDiagnostics =
    process.env.AI_REASONING_DIAGNOSTICS === '1' || process.env.NODE_ENV === 'test';
  const reasonedPackage = runIntelligenceQuality({
    envelopes,
    scope,
    domainStatuses,
    evidence,
    portfolioValueUsd: context.portfolioValueUsd,
    periodDays: context.periodDays,
    context: relevanceContext,
    includeDiagnostics,
    focusAsset: plan.entities.asset ?? section.asset ?? null,
    userQuestion: question.length > 0 ? question : null,
    analysisLevelLabel: 'wallet',
  });
  const llmReasoning = serializeForLlm(reasonedPackage);
  const publicReasoned = toPublicReasonedIntelligence(reasonedPackage, {
    includeDiagnostics,
  });
  tracer.markEnd('reasoningMs');

  // Package 3 — memory retrieval (pre) + persistence / lifecycle (post-reasoning)
  tracer.markStart('memoryMs');
  let memoryPrompt = '';
  let memoryUsed:
    | {
        conversation: boolean;
        preferences: string[];
        previousAnalysis: boolean;
        lifecycleRecords: number;
      }
    | undefined;
  let persistedAnalysisId: string | null = null;
  let historicalWhatMatters: RunAnalysisResult['historicalWhatMatters'] = null;
  try {
    const prior = await prepareMemoryForRequest({
      userId: args.userId,
      walletId: args.walletId,
      question,
      mode: args.mode,
      conversationId: args.conversationId,
      analysisType: args.mode === 'chat' ? 'chat' : 'dashboard',
      page: section.page ?? section.sectionType,
    });
    const memoryFinal = await finalizeMemoryAfterAnalysis({
      userId: args.userId,
      walletId: args.walletId,
      mode: args.mode,
      analysisType: args.mode === 'chat' ? 'chat' : 'dashboard',
      scope,
      pkg: reasonedPackage,
      traceId: tracer.traceId,
      pipelineVersion: PIPELINE_VERSION,
      responseSchemaVersion: RESPONSE_SCHEMA_VERSION,
      conversationId: args.conversationId,
      priorBundle: prior.bundle,
    });
    memoryPrompt = memoryFinal.memoryPrompt;
    memoryUsed = memoryFinal.memoryUsed;
    persistedAnalysisId = memoryFinal.persisted?.id ?? null;
    historicalWhatMatters = memoryFinal.historicalWhatMatters?.sincePrevious ?? null;
  } catch (memoryError) {
    // Memory must not fail the authoritative analysis path.
    console.warn('[ai/memory] finalize skipped', memoryError);
  }
  tracer.markEnd('memoryMs');

  const usesFullReport = tools.includes('generate_intelligence_report');
  tracer.markStart('llmMs');
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
    purpose: usesFullReport ? 'report' : 'default',
    now: new Date(context.now),
    // LLM may only cite Package 2 selected / approved insight IDs (legacy ids).
    allowedFindingIds:
      llmReasoning.allowedFindingIds.length > 0
        ? llmReasoning.allowedFindingIds
        : normalizedFindings.map(f => f.id),
    approvedNumerics,
    reasonedSummary: {
      whatMatters: llmReasoning.whatMatters,
      selectedInsights: llmReasoning.selectedInsights,
      attributionSummary: llmReasoning.attributionSummary,
      limitations: llmReasoning.limitations,
      monitoringPoints: llmReasoning.monitoringPoints.map(m => m.explanation),
    },
    memoryPrompt: memoryPrompt || undefined,
  });
  tracer.markEnd('llmMs');

  const completionStatus = deriveCompletionStatus({
    domainStatuses,
    pending:
      dataRequirementsPlan.transactions.mode === 'full_entitled_history' &&
      context.coverage.isFullEntitledHistory !== true &&
      context.coverage.truncated,
  });

  const versions: AiVersions = {
    pipelineVersion: PIPELINE_VERSION,
    responseSchemaVersion: RESPONSE_SCHEMA_VERSION,
    promptVersion: RADAREUM_PROMPT_VERSION,
    engineVersions: ENGINE_VERSIONS,
  };

  // Primary insights = Package 2 selected approved set (legacy shape for compatibility).
  const selectedApproved = reasonedPackage.approvedInsights.filter(a =>
    reasonedPackage.selectedInsightIds.includes(a.id),
  );
  const insightsFromReasoning: AnalysisInsight[] = selectedApproved.map(a => {
    const legacy = allowedInsights.find(i => i.id === a.legacyFindingId);
    return {
      id: a.legacyFindingId ?? a.id,
      type: a.type,
      title: a.title,
      description: a.proposedMeaning || a.description,
      severity: legacy?.severity ?? (a.priority.level === 'critical' ? 'critical' : a.priority.level === 'high' ? 'high' : 'medium'),
      confidence: legacy?.confidence ?? 'medium',
      category: (legacy?.category ?? a.category) as AnalysisInsight['category'],
      evidence: legacy?.evidence ?? {},
      impact: a.userMeaning.general ?? a.proposedMeaning,
      impactUsd: a.impactUsd ?? null,
      relatedEntities: a.entityIds,
    };
  });
  const insights: AnalysisInsight[] =
    insightsFromReasoning.length > 0
      ? insightsFromReasoning
      : allowedInsights.map(i => ({
          id: i.id,
          type: i.type,
          title: i.title,
          description: i.description,
          severity: i.severity,
          confidence: i.confidence,
          category: i.category ?? null,
          evidence: i.evidence,
          impact: i.impact ?? null,
          impactUsd: i.impactUsd ?? null,
          relatedEntities: i.relatedEntities,
        }));

  tracer.log('analysis_complete', {
    completionStatus,
    tools: tools,
    fallback: narrative.fallbackReason,
  });

  return {
    narrative: narrative.text,
    source: narrative.source,
    intelligence: envelopes,
    insights,
    metrics,
    patterns: collectPatterns(envelopes),
    toolsUsed: envelopes.map(envelope => envelope.tool),
    plan: { ...plan, tools },
    analysisMode: plan.mode,
    confidence: mergeConfidence(envelopes, context),
    dataQuality: {
      ...buildDataQuality(envelopes, context),
      isFullEntitledHistory: context.coverage.isFullEntitledHistory === true,
      notes: [...buildDataQuality(envelopes, context).notes, ...eligibility.limitations],
    },
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
    completionStatus,
    structuredNarrative: narrative.structuredNarrative,
    scope,
    domainStatuses,
    grounding,
    evidence,
    normalizedFindings,
    validation: narrative.validation,
    traceId: tracer.traceId,
    versions,
    dataRequirementsPlan,
    reasonedIntelligence: publicReasoned,
    reasoningDiagnostics: includeDiagnostics ? reasonedPackage.diagnostics : undefined,
    conversationId: args.conversationId ?? null,
    persistedAnalysisId,
    historicalWhatMatters,
    memoryUsed,
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

function mergeConfidence(envelopes: EngineOutput[], context: WalletContext): Confidence {
  if (envelopes.length === 0) return 'low';
  // Screen Analyze is about what the user sees now. History-reconstruction
  // modules (performance / risk) must not force Low when holdings are priced.
  let list = envelopes;
  if (context.intelligenceInput.dataGrounding === 'screen') {
    const focused = envelopes.filter(
      envelope =>
        envelope.tool !== 'get_performance_analysis' && envelope.tool !== 'get_risk_intelligence',
    );
    if (focused.length > 0) list = focused;
  }
  return lowestConfidence(...list.map(envelope => envelope.confidence));
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
