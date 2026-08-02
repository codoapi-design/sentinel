/**
 * Radareum AI — LLM adapter and prompt assembly layer.
 *
 * `generateNarrative` is the single entry point. It uses the LLM when a
 * provider key is configured and the deterministic renderer otherwise, and
 * applies the output guardrails to both paths.
 *
 * Package 1: structured narrative schema validation + numeric fidelity checks.
 */

import {
  buildMetricCatalog,
  collectApprovedNumerics,
  extractJsonObject,
  parseStructuredNarrative,
  repairNarrativeText,
  renderMetricTemplate,
  renderStructuredNarrativeMarkdown,
  STRUCTURED_OUTPUT_INSTRUCTIONS,
  structuredNarrativeFromDeterministic,
  validateNarrativeAgainstIntelligence,
  type ApprovedNumericValue,
  type NarrativeValidationReport,
  type StructuredNarrative,
} from '@/lib/ai/trust';
import { enforceNarrativeConstraints } from '@/lib/ai/intelligence-quality/narrative-constraints';
import { scoreConfidence } from '@/lib/ai/intelligence-quality/confidence-util';

import { sanitizeAgentOutput, type GuardrailViolation } from './guardrails';
import { buildMessages, type AgentMode, type RuntimeContext } from './prompts';
import {
  getLlmProvider,
  isLlmError,
  type ChatMessage,
  type LlmModelPurpose,
  type LlmProvider,
  type LlmUsage,
} from './provider';
import { renderDeterministicNarrative, type NarrativeIntelligence } from './render';

export * from './guardrails';
export * from './prompts';
export * from './provider';
export * from './render';

export type NarrativeSource = 'llm' | 'deterministic';

export interface GenerateNarrativeArgs {
  mode: AgentMode;
  runtimeContext: RuntimeContext;
  intelligence?: NarrativeIntelligence | NarrativeIntelligence[] | null;
  userMessage?: string;
  history?: ChatMessage[];
  /** Page or section the analysis belongs to, e.g. "Portfolio". */
  section?: string;
  period?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * Model lane: `default` = AI_MODEL (gpt-4o-mini), `report` = AI_MODEL_REPORT (gpt-4o).
   * Ignored when `provider` is injected.
   */
  purpose?: LlmModelPurpose;
  /** Injectable provider; defaults to the environment-resolved one for `purpose`. */
  provider?: LlmProvider;
  /** Forces the deterministic path even when a key is configured. */
  preferDeterministic?: boolean;
  /** Reference instant for relative dates. Defaults to `new Date()`. */
  now?: Date;
  /** Finding IDs allowed in structuredNarrative.selectedFindingIds. */
  allowedFindingIds?: string[];
  /** Approved numeric values for fidelity validation. */
  approvedNumerics?: ApprovedNumericValue[];
  /** Package 2 selected reasoning summary — LLM explains only this. */
  reasonedSummary?: {
    whatMatters: {
      headline: string;
      whatChanged: string;
      whyItMatters: string;
      mainCause?: string;
      mainOffset?: string;
    };
    selectedInsights: Array<{
      id: string;
      title: string;
      meaning: string;
      priority: number;
      cause: string;
      limitations: string[];
    }>;
    attributionSummary: string;
    limitations: string[];
    monitoringPoints: string[];
  };
  /** Package 3 memory prompt blocks. */
  memoryPrompt?: string;
}

export interface GenerateNarrativeResult {
  text: string;
  source: NarrativeSource;
  violations: GuardrailViolation[];
  providerId: string;
  model?: string;
  usage?: LlmUsage;
  /** Present whenever the LLM path was available but not used. */
  fallbackReason?: string;
  structuredNarrative?: StructuredNarrative;
  validation?: NarrativeValidationReport;
}

/** Response budgets per channel (Part 7 §7.3 target lengths). */
const MAX_TOKENS_BY_MODE: Record<AgentMode, number> = {
  dashboard: 800,
  chat: 450,
  telegram: 250,
};

/** Full executive reports need a larger completion budget. */
const MAX_TOKENS_REPORT = 1600;

const DEFAULT_TEMPERATURE = 0.2;

function describeFailure(error: unknown): string {
  if (isLlmError(error)) return `llm_error:${error.code}`;
  return 'llm_error:unknown';
}

function modulesOf(
  intelligence?: NarrativeIntelligence | NarrativeIntelligence[] | null,
): NarrativeIntelligence[] {
  if (!intelligence) return [];
  return Array.isArray(intelligence) ? intelligence : [intelligence];
}

function collectFindingIds(modules: NarrativeIntelligence[]): string[] {
  return modules.flatMap(m =>
    (m.insights ?? [])
      .map(i => i.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

function flattenNarrativeMetrics(
  metrics: NarrativeIntelligence['metrics'],
): Array<{ value: unknown; key?: string; label?: string; unit?: string }> {
  if (!metrics || typeof metrics !== 'object') return [];
  const out: Array<{ value: unknown; key?: string; label?: string; unit?: string }> = [];
  for (const [key, value] of Object.entries(metrics as Record<string, unknown>)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      out.push({ value, key, label: key });
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (
          typeof nestedValue === 'number' ||
          typeof nestedValue === 'string' ||
          typeof nestedValue === 'boolean'
        ) {
          out.push({ value: nestedValue, key: `${key}.${nestedKey}`, label: nestedKey });
        }
      }
    }
  }
  return out;
}

function approvedFromIntelligence(
  modules: NarrativeIntelligence[],
  explicit?: ApprovedNumericValue[],
  portfolioValueUsd?: number,
): ApprovedNumericValue[] {
  if (explicit && explicit.length > 0) return explicit;
  const metrics = modules.flatMap(m => flattenNarrativeMetrics(m.metrics));
  const evidenceValues = modules.flatMap(m => Object.values(m.evidence ?? {}));
  return collectApprovedNumerics({ metrics, evidenceValues, portfolioValueUsd });
}

function validateTexts(
  texts: string[],
  approved: ApprovedNumericValue[],
): NarrativeValidationReport {
  return validateNarrativeAgainstIntelligence({ texts, approved });
}

function buildDeterministicResult(
  args: GenerateNarrativeArgs,
  provider: LlmProvider,
  fallbackReason: string | undefined,
  modules: NarrativeIntelligence[],
  approved: ApprovedNumericValue[],
): GenerateNarrativeResult {
  const deterministic = renderDeterministicNarrative({
    mode: args.mode,
    intelligence: args.intelligence,
    runtimeContext: args.runtimeContext,
    section: args.section,
    period: args.period,
    now: args.now,
  });

  const sanitized = sanitizeAgentOutput(deterministic);
  const findingIds = args.allowedFindingIds ?? collectFindingIds(modules);
  const structured = structuredNarrativeFromDeterministic({
    headline: args.section?.trim() || 'Analysis',
    summary: sanitized.text.slice(0, 4000),
    interpretation: '',
    monitoringPoints: modules.flatMap(m => m.monitoringPoints ?? []).slice(0, 8),
    limitations: modules.flatMap(m => m.dataQuality?.issues ?? []).slice(0, 8),
    findingIds: findingIds.slice(0, 15),
    language: args.runtimeContext.user?.locale?.startsWith('ar') ? 'ar' : 'en',
    directAnswer: sanitized.text.split('\n').find(l => l.trim().length > 0)?.slice(0, 400),
  });

  const validation = validateTexts(
    [
      structured.headline,
      structured.directAnswer ?? '',
      structured.summary,
      structured.interpretation,
      ...structured.monitoringPoints,
    ],
    approved,
  );

  // Deterministic path sources numbers from approved metrics; if a rare mismatch
  // appears from prose formatting, strip unmatched claims.
  let text = sanitized.text;
  let report = validation;
  if (!validation.valid) {
    const repaired = repairNarrativeText(text, validation);
    text = repaired.text || text;
    report = {
      ...validateTexts([text], approved),
      correctionsApplied: repaired.correctionsApplied,
    };
  }

  return {
    text,
    source: 'deterministic',
    violations: sanitized.violations,
    providerId: provider.id,
    fallbackReason,
    structuredNarrative: structured,
    validation: report,
  };
}

async function completeOnce(
  provider: LlmProvider,
  args: GenerateNarrativeArgs,
  purpose: LlmModelPurpose,
): Promise<{ text: string; model?: string; usage?: LlmUsage }> {
  const defaultMaxTokens =
    purpose === 'report' ? MAX_TOKENS_REPORT : MAX_TOKENS_BY_MODE[args.mode];
  const response = await provider.complete({
    messages: buildMessages({
      mode: args.mode,
      runtimeContext: args.runtimeContext,
      intelligence: args.intelligence,
      userMessage: args.userMessage,
      history: args.history,
      section: args.section,
      period: args.period,
      structuredOutput: true,
      structuredOutputInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
      reasonedSummary: args.reasonedSummary,
      memoryPrompt: args.memoryPrompt,
    }),
    temperature: args.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: args.maxTokens ?? defaultMaxTokens,
    signal: args.signal,
    responseFormat: 'json_object',
  });
  return { text: response.text, model: response.model, usage: response.usage };
}

/**
 * Produces the final user-facing narrative.
 *
 * Order of preference:
 *   1. Structured LLM completion, schema + numeric validated.
 *   2. One constrained repair / retry.
 *   3. Deterministic renderer.
 */
export async function generateNarrative(
  args: GenerateNarrativeArgs
): Promise<GenerateNarrativeResult> {
  const purpose: LlmModelPurpose = args.purpose ?? 'default';
  const provider = args.provider ?? getLlmProvider(purpose);
  const configured = provider.isConfigured();
  const modules = modulesOf(args.intelligence);
  const allowed = new Set(args.allowedFindingIds ?? collectFindingIds(modules));
  const approved = approvedFromIntelligence(
    modules,
    args.approvedNumerics,
    args.runtimeContext.portfolio?.totalValueUsd,
  );

  let fallbackReason: string | undefined;

  if (args.preferDeterministic) {
    fallbackReason = 'deterministic_requested';
  } else if (!configured) {
    fallbackReason = 'no_llm_provider_configured';
  } else {
    try {
      let attempt = await completeOnce(provider, args, purpose);
      let parsed = parseStructuredNarrative(extractJsonObject(attempt.text) ?? attempt.text, allowed);

      if (!parsed.ok) {
        // One schema retry
        attempt = await completeOnce(provider, args, purpose);
        parsed = parseStructuredNarrative(extractJsonObject(attempt.text) ?? attempt.text, allowed);
      }

      if (parsed.ok) {
        let structured = parsed.value;
        let constraintsOk = true;
        if (args.reasonedSummary) {
          const constraint = enforceNarrativeConstraints(structured, {
            allowedFindingIds: allowed,
            selectedInsights: args.reasonedSummary.selectedInsights.map(s => ({
              id: s.id,
              type: 'selected',
              priority: {
                score: s.priority,
                level: 'medium' as const,
                components: {
                  materiality: 0,
                  significance: 0,
                  confidence: 0,
                  novelty: 0,
                  persistence: 0,
                  userRelevance: 0,
                  dataQualityPenalty: 0,
                  duplicationPenalty: 0,
                },
                reasons: [],
              },
              reasoning: {
                hypotheses: [
                  {
                    id: `cause:${s.id}`,
                    causeType: 'unknown' as const,
                    affectedEntityIds: [],
                    supportingEvidenceIds: [],
                    contradictingEvidenceIds: [],
                    confidence: scoreConfidence({ sample: 40 }),
                    status: s.cause.toLowerCase().includes('cannot determine')
                      ? ('insufficient_data' as const)
                      : ('supported' as const),
                    languageState: s.cause.toLowerCase().includes('cannot determine')
                      ? ('cannot_determine' as const)
                      : ('likely' as const),
                  },
                ],
                selectedCauseIds: [`cause:${s.id}`],
                summary: s.cause,
                confidence: scoreConfidence({ sample: 40 }),
              },
              legacyFindingId: s.id,
            })),
            requiredLimitations: args.reasonedSummary.limitations.filter(l =>
              /individual wallet|snapshot|near zero|truncated|pricing/i.test(l),
            ),
          });
          if (!constraint.ok) {
            constraintsOk = false;
            fallbackReason = `narrative_constraints:${constraint.violations.slice(0, 3).join(',')}`;
          }
        }
        if (!constraintsOk) {
          // Skip LLM structured acceptance — deterministic path below.
        } else {
        let report = validateTexts(
          [
            structured.headline,
            structured.directAnswer ?? '',
            structured.summary,
            structured.interpretation,
            ...structured.monitoringPoints,
          ],
          approved,
        );

        if (!report.valid) {
          // Constrained repair once (strip unmatched claims), then revalidate.
          const fields = [
            'headline',
            'directAnswer',
            'summary',
            'interpretation',
          ] as const;
          const corrections: string[] = [];
          for (const field of fields) {
            const current = structured[field];
            if (typeof current !== 'string' || !current) continue;
            const repaired = repairNarrativeText(current, report);
            if (repaired.correctionsApplied.length) {
              (structured as StructuredNarrative)[field] = repaired.text as never;
              corrections.push(...repaired.correctionsApplied.map(c => `${field}: ${c}`));
            }
          }
          structured = {
            ...structured,
            monitoringPoints: structured.monitoringPoints
              .map(p => repairNarrativeText(p, report).text)
              .filter(Boolean),
          };
          report = {
            ...validateTexts(
              [
                structured.headline,
                structured.directAnswer ?? '',
                structured.summary,
                structured.interpretation,
                ...structured.monitoringPoints,
              ],
              approved,
            ),
            correctionsApplied: corrections,
          };
        }

        if (report.valid) {
          // Server-inject approved metric tokens before render.
          const catalog = buildMetricCatalog(approved);
          structured = {
            ...structured,
            headline: renderMetricTemplate(structured.headline, catalog).text,
            directAnswer: structured.directAnswer
              ? renderMetricTemplate(structured.directAnswer, catalog).text
              : structured.directAnswer,
            summary: renderMetricTemplate(structured.summary, catalog).text,
            interpretation: renderMetricTemplate(structured.interpretation, catalog).text,
            monitoringPoints: structured.monitoringPoints.map(
              p => renderMetricTemplate(p, catalog).text,
            ),
          };
          const markdown = renderStructuredNarrativeMarkdown(structured);
          const sanitized = sanitizeAgentOutput(markdown);
          if (sanitized.text.trim().length > 0) {
            return {
              text: sanitized.text,
              source: 'llm',
              violations: sanitized.violations,
              providerId: provider.id,
              model: attempt.model,
              usage: attempt.usage,
              structuredNarrative: structured,
              validation: report,
            };
          }
          fallbackReason = 'llm_empty_after_guardrails';
        } else {
          fallbackReason = 'numeric_validation_failed';
        }
        } // constraintsOk
      } else {
        fallbackReason = `structured_schema_invalid:${parsed.reason}`;
      }
    } catch (error) {
      if (isLlmError(error) && error.code === 'aborted') throw error;
      // One bounded retry for retryable transport errors
      if (isLlmError(error) && error.retryable) {
        try {
          await new Promise(r => setTimeout(r, 250));
          const retry = await completeOnce(provider, args, purpose);
          const parsed = parseStructuredNarrative(
            extractJsonObject(retry.text) ?? retry.text,
            allowed,
          );
          if (parsed.ok) {
            const report = validateTexts(
              [
                parsed.value.headline,
                parsed.value.directAnswer ?? '',
                parsed.value.summary,
                parsed.value.interpretation,
                ...parsed.value.monitoringPoints,
              ],
              approved,
            );
            if (report.valid) {
              const markdown = renderStructuredNarrativeMarkdown(parsed.value);
              const sanitized = sanitizeAgentOutput(markdown);
              if (sanitized.text.trim().length > 0) {
                return {
                  text: sanitized.text,
                  source: 'llm',
                  violations: sanitized.violations,
                  providerId: provider.id,
                  model: retry.model,
                  usage: retry.usage,
                  structuredNarrative: parsed.value,
                  validation: report,
                };
              }
            }
          }
        } catch (retryError) {
          if (isLlmError(retryError) && retryError.code === 'aborted') throw retryError;
          fallbackReason = describeFailure(retryError);
        }
      } else {
        fallbackReason = describeFailure(error);
      }
      if (!fallbackReason) fallbackReason = describeFailure(error);
    }
  }

  return buildDeterministicResult(args, provider, fallbackReason, modules, approved);
}
