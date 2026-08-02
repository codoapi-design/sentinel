/**
 * POST /api/ai/chat
 *
 * Conversational endpoint. Package 1: Zod validation, server-forced mode=chat,
 * traceId, versioned fields. Client `mode` is ignored.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  AiQuotaError,
  assertAiQuota,
  isWalletContextError,
  recordAiUsage,
  resolveAiQuotaWindow,
  runAnalysis,
  SubscriptionEntitlementError,
  summarizeIntelligence,
} from '@/lib/ai/tools';
import {
  chatRequestSchema,
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

    const parsed = chatRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(invalidAiRequest(tracer.traceId, zodIssuesToDetails(parsed.error)), {
        status: 400,
      });
    }

    const body = parsed.data;
    const pageContext = body.pageContext ?? {};
    const idempotencyKey = body.idempotencyKey;

    if (idempotencyKey) {
      const claim = await claimIdempotencyKey({
        key: idempotencyKey,
        userId: user.id,
        entryPoint: 'chat',
        requestHash: buildRequestHash({
          walletId: body.walletId,
          message: body.message,
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

    // Server controls mode — ignore client body.mode entirely.
    const result = await runAnalysis({
      walletId: body.walletId,
      userId: user.id,
      mode: 'chat',
      question: body.message,
      history: body.history ?? [],
      includeHidden: body.includeHidden === true,
      user: { plan: quotaPlanId },
      sectionContext: {
        sectionType: pageContext.sectionType ?? null,
        sectionTitle: pageContext.sectionTitle ?? null,
        page: pageContext.page ?? null,
        asset: pageContext.asset ?? null,
        network: pageContext.network ?? null,
        counterparty: pageContext.counterparty ?? null,
        typeId: pageContext.typeId ?? null,
        period: pageContext.period ?? null,
        filters: pageContext.filters ?? null,
      },
    });

    const charge = await shouldChargeUsage({ idempotencyKey, userId: user.id });
    if (charge) {
      await recordAiUsage({
        userId: user.id,
        kind: 'chat',
        usage: result.llm.usage,
        window: resolveAiQuotaWindow(quotaPlanId),
      });
      await markUsageCharged({ idempotencyKey, userId: user.id });
    }

    const responseBody = {
      success: true as const,
      data: {
        completionStatus: result.completionStatus,
        message: result.narrative,
        narrative: result.narrative,
        structuredNarrative: result.structuredNarrative,
        source: result.source,
        intelligence: summarizeIntelligence(result.intelligence),
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
        intents: result.plan.intents,
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
        entryPoint: 'chat',
        mode: 'chat',
        requestedPeriod: pageContext.period ?? null,
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
      return NextResponse.json(
        aiError(tracer.traceId, 'WALLET_NOT_FOUND', error.message),
        { status: error.status },
      );
    }

    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      aiError(
        tracer.traceId,
        'CHAT_FAILED',
        error instanceof Error ? error.message : 'Chat request failed',
      ),
      { status: 500 },
    );
  }
}
