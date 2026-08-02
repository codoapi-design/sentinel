/**
 * POST /api/ai/jobs/[id]/tick — process one durable chunk (serverless continuation).
 */

import { NextRequest, NextResponse } from 'next/server';

import { getAiAnalysisJob, processAiAnalysisJobTick } from '@/lib/ai/jobs';
import { aiError, createTraceIds, UUID_REGEX } from '@/lib/ai/trust';
import { createCookieServerClient } from '@/lib/supabase/server';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { traceId } = createTraceIds();
  const { id } = await context.params;

  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(aiError(traceId, 'INVALID_AI_REQUEST', 'Invalid job id.'), {
      status: 400,
    });
  }

  const cookieClient = await createCookieServerClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (!user) {
    return NextResponse.json(aiError(traceId, 'UNAUTHORIZED', 'Authentication required.'), {
      status: 401,
    });
  }

  const job = await getAiAnalysisJob(id, user.id);
  if (!job) {
    return NextResponse.json(aiError(traceId, 'JOB_NOT_FOUND', 'Job not found.'), { status: 404 });
  }

  const tick = await processAiAnalysisJobTick(id);
  return NextResponse.json({
    success: true,
    data: {
      tick,
      completionStatus: tick.done && tick.status === 'completed' ? 'complete' : tick.status === 'failed' ? 'failed' : 'pending',
      traceId,
    },
  });
}
