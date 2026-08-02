/**
 * POST /api/ai/analyze
 *
 * Page and section analysis behind every "AI Data Analysis" button.
 * Package 1: Zod validation, server-forced mode=dashboard, traceId, versioned fields.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  isWalletContextError,
  recordAiUsage,
  runAnalysis,
  AiQuotaError,
  assertAiQuota,
  SubscriptionEntitlementError,
  resolveAiQuotaWindow,
} from '@/lib/ai/tools';
import { parseScreenSnapshot } from '@/lib/ai-screen-snapshot';
import {
  analyzeRequestSchema,
  aiError,
  invalidAiRequest,
  zodIssuesToDetails,
  AiRequestTracer,
  persistAiTrace,
  claimIdempotencyKey,
  completeIdempotencyKey,
  buildRequestHash,
  shouldChargeUsage,
  markUsageCharged,
  MAX_AI_BODY_BYTES,
} from '@/lib/ai/trust';
import { createCookieServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const tracer = new AiRequestTracer();
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_AI_BODY_BYTES) {
    return NextResponse.json(
      aiError(tracer.traceId, 'PAYLOAD_TOO_LARGE', 'Request body exceeds size limit.'),
      { status: 413 },
    );
  }

  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        aiError(tracer.traceId, 'UNAUTHORIZED', 'Authentication required.'),
        { status: 401 },
      );
    }

    let quotaPlanId: string | null = null;
    try {
      const quota = await assertAiQuota(user.id);
      quotaPlanId = quota.planId;
    } catch (error) {
      if (error instanceof SubscriptionEntitlementError) {
        return NextResponse.json(
          aiError(tracer.traceId, 'SUBSCRIPTION_REQUIRED', error.message),
          { status: error.status },
        );
      }
      if (error instanceof AiQuotaError) {
        return NextResponse.json(
          aiError(tracer.traceId, 'AI_QUOTA_EXCEEDED', error.message),
          { status: error.status },
        );
      }
      throw error;
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(
        aiError(tracer.traceId, 'INVALID_JSON', 'Invalid JSON body.'),
        { status: 400 },
      );
    }

    const parsed = analyzeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(invalidAiRequest(tracer.traceId, zodIssuesToDetails(parsed.error)), {
        status: 400,
      });
    }

    const body = parsed.data;
    const idempotencyKey = body.idempotencyKey;
    if (idempotencyKey) {
      const claim = await claimIdempotencyKey({
        key: idempotencyKey,
        userId: user.id,
        entryPoint: 'analyze',
        requestHash: buildRequestHash({
          walletId: body.walletId,
          sectionType: body.sectionType,
          period: body.period,
          asset: body.asset,
        }),
      });
      if (claim.status === 'replay') {
        return NextResponse.json(claim.responseBody, { status: claim.responseStatus });
      }
      if (claim.status === 'in_progress') {
        return NextResponse.json(
          aiError(tracer.traceId, 'REQUEST_IN_PROGRESS', 'An identical request is already in progress.'),
          { status: 409 },
        );
      }
    }

    // Server controls mode — never trust client `mode`.
    const result = await runAnalysis({
      walletId: body.walletId,
      userId: user.id,
      mode: 'dashboard',
      includeHidden: body.includeHidden === true,
      screenSnapshot: parseScreenSnapshot(body.screenSnapshot),
      user: { plan: quotaPlanId },
      sectionContext: {
        sectionType: body.sectionType ?? null,
        sectionTitle: body.sectionTitle ?? null,
        page: body.page ?? null,
        asset: body.asset ?? null,
        network: body.network ?? null,
        counterparty: body.counterparty ?? null,
        typeId: body.typeId ?? null,
        period: body.period ?? null,
        filters: body.filters ?? null,
      },
    });

    const charge = await shouldChargeUsage({ idempotencyKey, userId: user.id });
    if (charge) {
      await recordAiUsage({
        userId: user.id,
        kind: 'analysis',
        usage: result.llm.usage,
        window: resolveAiQuotaWindow(quotaPlanId),
      });
      await markUsageCharged({ idempotencyKey, userId: user.id });
    }

    const responseBody = {
      success: true as const,
      data: {
        completionStatus: result.completionStatus,
        narrative: result.narrative,
        structuredNarrative: result.structuredNarrative,
        source: result.source,
        insights: result.insights,
        metrics: result.metrics,
        evidence: result.evidence,
        scope: result.scope,
        domainStatuses: result.domainStatuses,
        grounding: result.grounding,
        confidence: result.confidence,
        dataQuality: result.dataQuality,
        validation: {
          numericConsistency: result.validation ?? { valid: true },
        },
        toolsUsed: result.toolsUsed,
        analysisMode: result.analysisMode,
        periodDays: result.periodDays,
        periodLabel: result.periodLabel,
        generatedAt: result.generatedAt,
        traceId: result.traceId,
        versions: result.versions,
        jobId: result.jobId,
        reasonedIntelligence: result.reasonedIntelligence,
        ...(result.reasoningDiagnostics
          ? { reasoningDiagnostics: result.reasoningDiagnostics }
          : {}),
        persistedAnalysisId: result.persistedAnalysisId ?? null,
        historicalWhatMatters: result.historicalWhatMatters ?? null,
        memoryUsed: result.memoryUsed,
      },
    };

    if (idempotencyKey) {
      await completeIdempotencyKey({
        key: idempotencyKey,
        userId: user.id,
        traceId: result.traceId,
        responseStatus: 200,
        responseBody,
      });
    }

    void persistAiTrace(
      tracer.buildRecord({
        userId: user.id,
        walletId: body.walletId,
        entryPoint: 'analyze',
        mode: 'dashboard',
        requestedPeriod: body.period ?? null,
        dataRequirementsPlan: result.dataRequirementsPlan,
        toolsPlanned: result.plan.tools,
        toolsExecuted: result.toolsUsed,
        model: result.llm.model,
        inputTokens: result.llm.usage?.promptTokens,
        outputTokens: result.llm.usage?.completionTokens,
        fallbackStatus: result.source,
        fallbackReason: result.llm.fallbackReason,
        domainStatuses: result.domainStatuses,
        finalConfidence: result.confidence,
        completionStatus: result.completionStatus,
        responseStatus: 200,
      }),
    );

    return NextResponse.json(responseBody);
  } catch (error) {
    if (error instanceof SubscriptionEntitlementError) {
      return NextResponse.json(
        aiError(tracer.traceId, 'SUBSCRIPTION_REQUIRED', error.message),
        { status: error.status },
      );
    }
    if (error instanceof AiQuotaError) {
      return NextResponse.json(
        aiError(tracer.traceId, 'AI_QUOTA_EXCEEDED', error.message),
        { status: error.status },
      );
    }
    if (isWalletContextError(error)) {
      void persistAiTrace(
        tracer.buildRecord({
          userId: 'unknown',
          walletId: null,
          entryPoint: 'analyze',
          mode: 'dashboard',
          toolsPlanned: [],
          toolsExecuted: [],
          responseStatus: error.status,
          errorCode: error.code,
          completionStatus: 'failed',
        }),
      );
      return NextResponse.json(
        aiError(tracer.traceId, 'WALLET_NOT_FOUND', error.message),
        { status: error.status },
      );
    }

    console.error('[AI Analyze] Error:', error);
    return NextResponse.json(
      aiError(
        tracer.traceId,
        'ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Analysis failed',
      ),
      { status: 500 },
    );
  }
}
