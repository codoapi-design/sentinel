/**
 * Sentinel AI — LLM adapter and prompt assembly layer.
 *
 * `generateNarrative` is the single entry point. It uses the LLM when a
 * provider key is configured and the deterministic renderer otherwise, and
 * applies the output guardrails to both paths.
 *
 * Enable the LLM path by setting `OPENAI_API_KEY` (optionally with
 * `OPENAI_BASE_URL`, `AI_MODEL`, `AI_MODEL_REPORT`, `AI_TIMEOUT_MS`).
 * No other change is needed.
 */

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

/**
 * Produces the final user-facing narrative.
 *
 * Order of preference:
 *   1. LLM completion, when a provider is configured and not opted out of.
 *   2. Deterministic renderer, on any LLM failure or when unconfigured.
 *
 * Guardrails are applied to whichever path produced the text. An abort
 * requested by the caller propagates instead of silently falling back.
 */
export async function generateNarrative(
  args: GenerateNarrativeArgs
): Promise<GenerateNarrativeResult> {
  const purpose: LlmModelPurpose = args.purpose ?? 'default';
  const provider = args.provider ?? getLlmProvider(purpose);
  const configured = provider.isConfigured();

  let fallbackReason: string | undefined;

  if (args.preferDeterministic) {
    fallbackReason = 'deterministic_requested';
  } else if (!configured) {
    fallbackReason = 'no_llm_provider_configured';
  } else {
    try {
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
        }),
        temperature: args.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: args.maxTokens ?? defaultMaxTokens,
        signal: args.signal,
      });

      const sanitized = sanitizeAgentOutput(response.text);

      if (sanitized.text.trim().length > 0) {
        return {
          text: sanitized.text,
          source: 'llm',
          violations: sanitized.violations,
          providerId: provider.id,
          model: response.model,
          usage: response.usage,
        };
      }

      fallbackReason = 'llm_empty_after_guardrails';
    } catch (error) {
      if (isLlmError(error) && error.code === 'aborted') throw error;
      fallbackReason = describeFailure(error);
    }
  }

  const deterministic = renderDeterministicNarrative({
    mode: args.mode,
    intelligence: args.intelligence,
    runtimeContext: args.runtimeContext,
    section: args.section,
    period: args.period,
    now: args.now,
  });

  const sanitized = sanitizeAgentOutput(deterministic);

  return {
    text: sanitized.text,
    source: 'deterministic',
    violations: sanitized.violations,
    providerId: provider.id,
    fallbackReason,
  };
}
