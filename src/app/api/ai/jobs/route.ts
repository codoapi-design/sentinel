/**
 * POST /api/ai/jobs — create a durable full-history analysis job (or return existing idempotent).
 * GET  /api/ai/jobs?id= — status for the authenticated owner.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createAiAnalysisJob, getAiAnalysisJob } from '@/lib/ai/jobs';
import { processAiAnalysisJobTick } from '@/lib/ai/jobs/worker';
import {
  aiError,
  createTraceIds,
  invalidAiRequest,
  resolveAiHistoryEntitlement,
  UUID_REGEX,
  zodIssuesToDetails,
} from '@/lib/ai/trust';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

const createSchema = z
  .object({
    walletId: z.string().regex(UUID_REGEX),
    jobType: z.enum(['full_history_analysis', 'filtered_history_analysis']).default('full_history_analysis'),
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    asset: z.string().max(64).optional(),
    network: z.string().max(64).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    /** When true, process one tick immediately (serverless continuation). */
    runTick: z.boolean().optional(),
  })
  .strip();

export async function GET(request: NextRequest) {
  const { traceId } = createTraceIds();
  const cookieClient = await createCookieServerClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json(aiError(traceId, 'UNAUTHORIZED', 'Authentication required.'), {
      status: 401,
    });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(aiError(traceId, 'INVALID_AI_REQUEST', 'Job id is required.'), {
      status: 400,
    });
  }

  const job = await getAiAnalysisJob(id, user.id);
  if (!job) {
    return NextResponse.json(aiError(traceId, 'JOB_NOT_FOUND', 'Job not found.'), { status: 404 });
  }

  return NextResponse.json({ success: true, data: { job, traceId } });
}

export async function POST(request: NextRequest) {
  const { traceId } = createTraceIds();
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    if (!user) {
      return NextResponse.json(aiError(traceId, 'UNAUTHORIZED', 'Authentication required.'), {
        status: 401,
      });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(aiError(traceId, 'INVALID_JSON', 'Invalid JSON body.'), {
        status: 400,
      });
    }

    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(invalidAiRequest(traceId, zodIssuesToDetails(parsed.error)), {
        status: 400,
      });
    }

    const body = parsed.data;
    const supabase = createServerClient();
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, created_at')
      .eq('id', body.walletId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!wallet) {
      return NextResponse.json(aiError(traceId, 'WALLET_NOT_FOUND', 'Wallet not found for this user.'), {
        status: 404,
      });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();

    const entitlement = resolveAiHistoryEntitlement({
      plan: profile?.plan,
      walletConnectedAt: (wallet as { created_at?: string }).created_at,
    });

    if (!entitlement.asyncFullHistoryAvailable && body.jobType === 'full_history_analysis') {
      return NextResponse.json(
        aiError(
          traceId,
          'ENTITLEMENT_DENIED',
          'Async full-history analysis is not available on this plan.',
        ),
        { status: 403 },
      );
    }

    const job = await createAiAnalysisJob({
      userId: user.id,
      walletId: body.walletId,
      jobType: body.jobType,
      requestedScope: {
        from: body.periodFrom ?? entitlement.allowedFrom,
        to: body.periodTo ?? entitlement.allowedTo,
        asset: body.asset,
        network: body.network,
      },
      entitlementScope: {
        allowedFrom: entitlement.allowedFrom,
        allowedTo: entitlement.allowedTo,
        plan: entitlement.plan,
        limitations: entitlement.limitations,
      },
      idempotencyKey: body.idempotencyKey,
      traceId,
    });

    let tick: Awaited<ReturnType<typeof processAiAnalysisJobTick>> | null = null;
    if (body.runTick !== false) {
      tick = await processAiAnalysisJobTick(job.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        job: tick ? { ...job, status: tick.status, progressProcessed: tick.processed, progressPct: tick.progressPct, resultRef: tick.resultRef } : job,
        tick,
        completionStatus: tick?.done && tick.status === 'completed' ? 'complete' : 'pending',
        traceId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      aiError(traceId, 'JOB_CREATE_FAILED', error instanceof Error ? error.message : 'Job create failed'),
      { status: 500 },
    );
  }
}
