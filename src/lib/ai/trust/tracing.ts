/**
 * Request-level tracing + log redaction for AI pipeline.
 */

import { createServerClient } from '@/lib/supabase/server';

import type { AiTraceRecord, TraceTimings } from './types';

export function createTraceIds(): { traceId: string; requestId: string } {
  const traceId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return { traceId, requestId: traceId };
}

export function maskWalletAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

export function redactForLogs(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    // Mask long hex / base58-looking addresses
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) return maskWalletAddress(value);
    if (value.length > 80 && /secret|token|bearer|api[_-]?key/i.test(value)) return '[redacted]';
    return value.length > 500 ? `${value.slice(0, 500)}…[truncated]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(redactForLogs);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|secret|authorization|apiKey|api_key|service_role/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redactForLogs(v);
      }
    }
    return out;
  }
  return value;
}

export class AiRequestTracer {
  readonly traceId: string;
  readonly requestId: string;
  readonly startedAt: number;
  private timings: TraceTimings = {};
  private marks = new Map<string, number>();

  constructor(traceId?: string, requestId?: string) {
    const ids = createTraceIds();
    this.traceId = traceId ?? ids.traceId;
    this.requestId = requestId ?? ids.requestId;
    this.startedAt = Date.now();
  }

  markStart(name: keyof TraceTimings | string): void {
    this.marks.set(name, Date.now());
  }

  markEnd(name: keyof TraceTimings): void {
    const start = this.marks.get(name) ?? this.startedAt;
    this.timings[name] = Date.now() - start;
  }

  getTimings(): TraceTimings {
    return {
      ...this.timings,
      totalMs: Date.now() - this.startedAt,
    };
  }

  buildRecord(partial: Omit<AiTraceRecord, 'traceId' | 'requestId' | 'timings' | 'createdAt'>): AiTraceRecord {
    return {
      traceId: this.traceId,
      requestId: this.requestId,
      timings: this.getTimings(),
      createdAt: new Date().toISOString(),
      ...partial,
    };
  }

  log(label: string, payload?: Record<string, unknown>): void {
    console.info(
      `[AI Trace ${this.traceId}] ${label}`,
      payload ? redactForLogs(payload) : '',
    );
  }
}

export async function persistAiTrace(record: AiTraceRecord): Promise<void> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('ai_request_traces' as never).insert({
      trace_id: record.traceId,
      request_id: record.requestId,
      user_id: record.userId,
      wallet_id: record.walletId,
      entry_point: record.entryPoint,
      mode: record.mode,
      requested_period: record.requestedPeriod ?? null,
      data_requirements_plan: record.dataRequirementsPlan ?? null,
      tools_planned: record.toolsPlanned,
      tools_executed: record.toolsExecuted,
      timings: record.timings,
      model: record.model ?? null,
      input_tokens: record.inputTokens ?? null,
      output_tokens: record.outputTokens ?? null,
      estimated_cost_usd: record.estimatedCostUsd ?? null,
      fallback_status: record.fallbackStatus ?? null,
      fallback_reason: record.fallbackReason ?? null,
      domain_statuses: record.domainStatuses ?? null,
      final_confidence: record.finalConfidence ?? null,
      completion_status: record.completionStatus ?? null,
      response_status: record.responseStatus,
      error_code: record.errorCode ?? null,
      created_at: record.createdAt,
    } as never);
    if (error) {
      console.warn('[AI Trace] persist skipped:', error.message);
    }
  } catch (error) {
    console.warn('[AI Trace] persist failed:', error);
  }
}
