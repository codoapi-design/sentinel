/**
 * High-level Package 3 orchestration around a completed Package 2 analysis.
 */

import type { ReasonedIntelligencePackage } from '@/lib/ai/intelligence-quality/types';
import type { AnalysisScope } from '@/lib/ai/trust/types';

import { persistReasonedAnalysis } from './analyses/persist';
import { maybeSummarizeConversation } from './conversations/service';
import { attachComparisonToContext, loadMemoryContext } from './retrieval/context';
import { planMemoryRetrieval } from './retrieval/planner';
import { renderMemoryPromptBlocks } from './retrieval/boundaries';
import { getMemoryStore } from './store/memory-store';
import type { HistoricalWhatMatters, MemoryContextBundle, PersistedReasonedAnalysis } from './types';

export async function prepareMemoryForRequest(input: {
  userId: string;
  walletId: string;
  question: string;
  mode: string;
  conversationId?: string | null;
  analysisType?: string;
  page?: string | null;
}): Promise<{ plan: ReturnType<typeof planMemoryRetrieval>; bundle: MemoryContextBundle; memoryPrompt: string }> {
  const plan = planMemoryRetrieval({
    question: input.question,
    mode: input.mode,
    conversationId: input.conversationId,
    walletId: input.walletId,
    analysisType: input.analysisType,
    page: input.page,
  });
  const bundle = await loadMemoryContext({
    userId: input.userId,
    plan,
    walletId: input.walletId,
  });
  return { plan, bundle, memoryPrompt: renderMemoryPromptBlocks(bundle) };
}

export async function finalizeMemoryAfterAnalysis(input: {
  userId: string;
  walletId: string;
  mode: string;
  analysisType: string;
  scope: AnalysisScope;
  pkg: ReasonedIntelligencePackage;
  traceId: string;
  pipelineVersion: string;
  responseSchemaVersion: string;
  conversationId?: string | null;
  priorBundle?: MemoryContextBundle | null;
}): Promise<{
  persisted: PersistedReasonedAnalysis | null;
  reused: boolean;
  historicalWhatMatters?: HistoricalWhatMatters | null;
  memoryPrompt: string;
  memoryUsed: {
    conversation: boolean;
    preferences: string[];
    previousAnalysis: boolean;
    lifecycleRecords: number;
  };
}> {
  const persistResult = await persistReasonedAnalysis({
    userId: input.userId,
    walletId: input.walletId,
    mode: input.mode,
    analysisType: input.analysisType,
    scope: input.scope,
    pkg: input.pkg,
    traceId: input.traceId,
    pipelineVersion: input.pipelineVersion,
    responseSchemaVersion: input.responseSchemaVersion,
    conversationId: input.conversationId,
  });

  let bundle =
    input.priorBundle ??
    (
      await prepareMemoryForRequest({
        userId: input.userId,
        walletId: input.walletId,
        question: '',
        mode: input.mode,
        conversationId: input.conversationId,
        analysisType: input.analysisType,
      })
    ).bundle;

  // Keep prior analyses for prompt labeling; refresh lifecycle after persist.
  const priorAnalyses = bundle.previousAnalyses;
  const refreshedLifecycles = await getMemoryStore().listLifecycles(
    input.userId,
    input.walletId,
  );
  bundle = {
    ...bundle,
    lifecycleRecords: refreshedLifecycles,
  };

  let historicalWhatMatters: HistoricalWhatMatters | null = null;
  if (persistResult?.analysis) {
    const compared = attachComparisonToContext(
      {
        ...bundle,
        // Prefer prior snapshot so the just-saved row is not treated as "historical".
        previousAnalyses: priorAnalyses.filter(a => a.id !== persistResult.analysis.id),
        lifecycleRecords: refreshedLifecycles,
      },
      persistResult.analysis,
    );
    historicalWhatMatters = compared.historicalWhatMatters ?? null;
    bundle = {
      ...compared,
      previousAnalyses: priorAnalyses.filter(a => a.id !== persistResult.analysis.id),
    };
  }

  if (input.conversationId) {
    await maybeSummarizeConversation(input.conversationId, input.userId);
  }

  return {
    persisted: persistResult?.analysis ?? null,
    reused: persistResult?.reused ?? false,
    historicalWhatMatters,
    memoryPrompt: renderMemoryPromptBlocks(bundle),
    memoryUsed: {
      conversation: Boolean(bundle.conversation),
      preferences: bundle.preferences.map(p => p.key),
      previousAnalysis: priorAnalyses.length > 0,
      lifecycleRecords: bundle.lifecycleRecords.length,
    },
  };
}
