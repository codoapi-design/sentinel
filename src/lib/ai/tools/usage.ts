/**
 * Sentinel AI — Usage Tracking
 *
 * Best-effort accounting into the existing `ai_usage` table. Tracking is
 * observability, not a gate: every failure is swallowed and logged, and a
 * request is never rejected because a counter could not be written.
 *
 * Daily counters (`chat_count`, `analysis_count`) roll over when
 * `last_reset_date` no longer matches today. Token totals are cumulative.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LlmUsage } from '@/lib/ai/llm';
import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

export type AiUsageKind = 'chat' | 'analysis';

export interface RecordAiUsageInput {
  userId: string;
  kind: AiUsageKind;
  /** Token counts from the LLM path; absent on the deterministic path. */
  usage?: LlmUsage;
  supabase?: SupabaseClient<Database>;
}

export interface AiUsageSnapshot {
  chatCount: number;
  analysisCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastResetDate: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Records one AI interaction. Never throws and never rejects. */
export async function recordAiUsage(input: RecordAiUsageInput): Promise<AiUsageSnapshot | null> {
  const userId = input.userId?.trim();
  if (!userId) return null;

  try {
    const supabase = input.supabase ?? createServerClient();
    const date = today();
    const inputTokens = input.usage?.promptTokens ?? 0;
    const outputTokens = input.usage?.completionTokens ?? 0;

    const { data: existing } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, last_reset_date, total_input_tokens, total_output_tokens')
      .eq('user_id', userId)
      .maybeSingle();

    const sameDay = existing?.last_reset_date === date;
    const baseChat = sameDay ? existing?.chat_count ?? 0 : 0;
    const baseAnalysis = sameDay ? existing?.analysis_count ?? 0 : 0;

    const next: AiUsageSnapshot = {
      chatCount: baseChat + (input.kind === 'chat' ? 1 : 0),
      analysisCount: baseAnalysis + (input.kind === 'analysis' ? 1 : 0),
      totalInputTokens: (existing?.total_input_tokens ?? 0) + inputTokens,
      totalOutputTokens: (existing?.total_output_tokens ?? 0) + outputTokens,
      lastResetDate: date,
    };

    const { error } = await supabase.from('ai_usage').upsert(
      {
        user_id: userId,
        chat_count: next.chatCount,
        analysis_count: next.analysisCount,
        last_reset_date: next.lastResetDate,
        total_input_tokens: next.totalInputTokens,
        total_output_tokens: next.totalOutputTokens,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.warn('[AI Usage] Failed to record usage:', error.message);
      return null;
    }

    return next;
  } catch (error) {
    console.warn('[AI Usage] Failed to record usage:', error);
    return null;
  }
}
