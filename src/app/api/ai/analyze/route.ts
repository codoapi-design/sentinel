/**
 * POST /api/ai/analyze
 *
 * Page and section analysis behind every "AI Data Analysis" button.
 *
 * The pipeline is deterministic end to end: the section context selects a tool
 * bundle, the tools run against verified wallet data, and the narrative is
 * written by the LLM when one is configured and by the deterministic renderer
 * otherwise. The response is identical in shape either way.
 *
 * Body:
 *   {
 *     walletId: string,          // required, must belong to the caller
 *     sectionType: string,       // e.g. "trading-volume", "revenue", "portfolio"
 *     sectionTitle?: string,
 *     asset?: string,
 *     network?: string,
 *     counterparty?: string,
 *     typeId?: string,
 *     period?: string | number,  // "30d" | "3m" | "all" | days
 *     filters?: Record<string, string | number | boolean | null>,
 *     includeHidden?: boolean    // include spam / dust rows
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';

import { isWalletContextError, recordAiUsage, runAnalysis, AiQuotaError, assertAiQuota } from '@/lib/ai/tools';
import { createCookieServerClient } from '@/lib/supabase/server';
import { normalizePlanId } from '@/lib/plans/address-families';

interface AnalyzeRequestBody {
  walletId?: unknown;
  sectionType?: unknown;
  sectionTitle?: unknown;
  page?: unknown;
  asset?: unknown;
  network?: unknown;
  counterparty?: unknown;
  typeId?: unknown;
  period?: unknown;
  filters?: unknown;
  includeHidden?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let quotaPlanId: string | null = null;
    try {
      const quota = await assertAiQuota(user.id);
      quotaPlanId = quota.planId;
    } catch (error) {
      if (error instanceof AiQuotaError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    let body: AnalyzeRequestBody;
    try {
      body = (await request.json()) as AnalyzeRequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const walletId = asString(body.walletId);
    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 });
    }

    const result = await runAnalysis({
      walletId,
      userId: user.id,
      mode: 'dashboard',
      includeHidden: body.includeHidden === true,
      sectionContext: {
        sectionType: asString(body.sectionType),
        sectionTitle: asString(body.sectionTitle),
        page: asString(body.page),
        asset: asString(body.asset),
        network: asString(body.network),
        counterparty: asString(body.counterparty),
        typeId: asString(body.typeId),
        period: asPeriod(body.period),
        filters: asFilters(body.filters),
      },
    });

    // Tracking is observability only — a failed counter never fails a request.
    await recordAiUsage({
      userId: user.id,
      kind: 'analysis',
      usage: result.llm.usage,
      accumulateLifetime: normalizePlanId(quotaPlanId) === 'free',
    });

    return NextResponse.json({
      success: true,
      data: {
        narrative: result.narrative,
        source: result.source,
        insights: result.insights,
        metrics: result.metrics,
        confidence: result.confidence,
        dataQuality: result.dataQuality,
        toolsUsed: result.toolsUsed,
        analysisMode: result.analysisMode,
        periodDays: result.periodDays,
        periodLabel: result.periodLabel,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error) {
    if (error instanceof AiQuotaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isWalletContextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[AI Analyze] Error:', error);
    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPeriod(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return asString(value);
}

function asFilters(value: unknown): Record<string, string | number | boolean | null> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const filters: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      filters[key] = entry;
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}
