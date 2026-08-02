/**
 * Idempotency for AI usage accounting (and optional persisted analysis).
 */

import { createServerClient } from '@/lib/supabase/server';

export interface IdempotencyClaim {
  key: string;
  userId: string;
  entryPoint: 'analyze' | 'chat';
  requestHash: string;
}

export type IdempotencyResult =
  | { status: 'new'; claimId: string }
  | { status: 'replay'; responseStatus: number; responseBody: unknown; traceId: string | null }
  | { status: 'in_progress' }
  | { status: 'unavailable' };

function hashRequest(parts: unknown): string {
  const raw = JSON.stringify(parts);
  // Lightweight non-crypto hash for dedupe fingerprint (not a security boundary).
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}

export function buildRequestHash(payload: unknown): string {
  return hashRequest(payload);
}

/**
 * Try to claim an idempotency key. On unique violation, return prior result if complete.
 */
export async function claimIdempotencyKey(input: IdempotencyClaim): Promise<IdempotencyResult> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('ai_idempotency_keys' as never)
      .insert({
        idempotency_key: input.key,
        user_id: input.userId,
        entry_point: input.entryPoint,
        request_hash: input.requestHash,
        status: 'in_progress',
      } as never)
      .select('id')
      .maybeSingle();

    if (!error && data && typeof (data as { id?: string }).id === 'string') {
      return { status: 'new', claimId: (data as { id: string }).id };
    }

    // Conflict — load existing
    const { data: existing } = await supabase
      .from('ai_idempotency_keys' as never)
      .select('status, response_status, response_body, trace_id, request_hash')
      .eq('idempotency_key', input.key)
      .eq('user_id', input.userId)
      .maybeSingle();

    if (!existing) return { status: 'unavailable' };

    const row = existing as {
      status: string;
      response_status: number | null;
      response_body: unknown;
      trace_id: string | null;
      request_hash: string;
    };

    if (row.request_hash !== input.requestHash) {
      return { status: 'unavailable' };
    }

    if (row.status === 'completed' && row.response_body != null) {
      return {
        status: 'replay',
        responseStatus: row.response_status ?? 200,
        responseBody: row.response_body,
        traceId: row.trace_id,
      };
    }

    if (row.status === 'in_progress') return { status: 'in_progress' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function completeIdempotencyKey(input: {
  key: string;
  userId: string;
  traceId: string;
  responseStatus: number;
  responseBody: unknown;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase
      .from('ai_idempotency_keys' as never)
      .update({
        status: 'completed',
        trace_id: input.traceId,
        response_status: input.responseStatus,
        response_body: input.responseBody as never,
        completed_at: new Date().toISOString(),
      } as never)
      .eq('idempotency_key', input.key)
      .eq('user_id', input.userId);
  } catch (error) {
    console.warn('[AI Idempotency] complete failed:', error);
  }
}

/**
 * Usage accounting that skips when the same idempotency key already charged.
 */
export async function shouldChargeUsage(input: {
  idempotencyKey?: string | null;
  userId: string;
}): Promise<boolean> {
  if (!input.idempotencyKey) return true;
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('ai_idempotency_keys' as never)
      .select('usage_charged, status')
      .eq('idempotency_key', input.idempotencyKey)
      .eq('user_id', input.userId)
      .maybeSingle();
    if (!data) return true;
    const row = data as { usage_charged?: boolean; status?: string };
    if (row.usage_charged === true) return false;
    return true;
  } catch {
    return true;
  }
}

export async function markUsageCharged(input: {
  idempotencyKey?: string | null;
  userId: string;
}): Promise<void> {
  if (!input.idempotencyKey) return;
  try {
    const supabase = createServerClient();
    await supabase
      .from('ai_idempotency_keys' as never)
      .update({ usage_charged: true } as never)
      .eq('idempotency_key', input.idempotencyKey)
      .eq('user_id', input.userId);
  } catch {
    // non-fatal
  }
}
