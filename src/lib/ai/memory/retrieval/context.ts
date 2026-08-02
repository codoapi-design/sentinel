import {
  buildAnalysisComparison,
  buildHistoricalWhatMatters,
  explainConclusionChange,
} from '../analyses/compare';
import { loadRecentMessages } from '../conversations/service';
import { listActivePreferences } from '../preferences/explicit';
import { getMemoryStore } from '../store/memory-store';
import type {
  AiConversation,
  AiConversationMessage,
  AiConversationSummary,
  InsightLifecycleRecord,
  MemoryContextBundle,
  MemoryRetrievalPlan,
  PersistedReasonedAnalysis,
} from '../types';

function trimToBudget(parts: Array<{ label: string; text: string }>, max: number) {
  let used = 0;
  const kept: string[] = [];
  const omitted: string[] = [];
  for (const p of parts) {
    if (used + p.text.length <= max) {
      kept.push(p.label);
      used += p.text.length;
    } else {
      omitted.push(p.label);
    }
  }
  return { kept, omitted, used };
}

export async function loadMemoryContext(input: {
  userId: string;
  plan: MemoryRetrievalPlan;
  walletId?: string | null;
}): Promise<MemoryContextBundle> {
  const store = getMemoryStore();
  const omitted: string[] = [];

  let conversation: AiConversation | null = null;
  let recentMessages: AiConversationMessage[] = [];
  let summary: AiConversationSummary | null = null;
  if (input.plan.conversation.required && input.plan.conversation.conversationId) {
    conversation = await store.getConversation(input.plan.conversation.conversationId, input.userId);
    if (conversation) {
      recentMessages = await loadRecentMessages(
        conversation.id,
        input.userId,
        input.plan.conversation.recentMessageLimit,
      );
      if (input.plan.conversation.includeSummary) {
        summary = await store.getLatestSummary(conversation.id);
      }
    }
  } else if (input.plan.conversation.required) {
    omitted.push('conversation_not_available');
  }

  const allPrefs = await listActivePreferences(input.userId);
  const preferences = allPrefs.filter(p => input.plan.preferences.keys.includes(p.key));

  let previousAnalyses: PersistedReasonedAnalysis[] = [];
  if (input.plan.previousAnalyses.required && input.walletId) {
    previousAnalyses = await store.listAnalyses(
      input.userId,
      input.walletId,
      input.plan.tokenBudget.maxHistoricalAnalyses,
    );
  }

  let lifecycleRecords: InsightLifecycleRecord[] = [];
  if (input.plan.lifecycle.required && input.walletId) {
    lifecycleRecords = await store.listLifecycles(input.userId, input.walletId);
    if (input.plan.lifecycle.activeOnly) {
      lifecycleRecords = lifecycleRecords.filter(
        l => !['resolved', 'superseded'].includes(l.state),
      );
    }
    lifecycleRecords = lifecycleRecords.slice(0, input.plan.tokenBudget.maxLifecycleRecords);
  }

  let comparison = null;
  let historicalWhatMatters = null;
  let conclusionChange = null;
  if (previousAnalyses[0] && previousAnalyses[1]) {
    // When loading before current persist, previousAnalyses[0] is latest prior
  }
  if (previousAnalyses.length >= 1 && input.plan.previousAnalyses.required) {
    // Comparison finalized after current persist in orchestrator; here expose prior only
  }

  const budgetParts = [
    {
      label: 'preferences',
      text: JSON.stringify(preferences),
    },
    {
      label: 'recent_messages',
      text: recentMessages.map(m => m.content).join('\n'),
    },
    {
      label: 'summary',
      text: summary ? JSON.stringify(summary.summary) : '',
    },
    {
      label: 'previous_analyses',
      text: JSON.stringify(
        previousAnalyses.map(a => ({
          id: a.id,
          createdAt: a.createdAt,
          headline: a.whatMatters.headline,
          historicalOnly: true,
        })),
      ),
    },
    {
      label: 'lifecycle',
      text: JSON.stringify(
        lifecycleRecords.map(l => ({
          key: l.lifecycleKey,
          state: l.state,
          historicalOnly: true,
        })),
      ),
    },
  ];
  const budget = trimToBudget(budgetParts, input.plan.tokenBudget.maxCharacters);
  omitted.push(...budget.omitted);

  return {
    plan: input.plan,
    conversation,
    recentMessages: budget.kept.includes('recent_messages') ? recentMessages : [],
    summary: budget.kept.includes('summary') ? summary : null,
    preferences,
    previousAnalyses: budget.kept.includes('previous_analyses') ? previousAnalyses : [],
    lifecycleRecords: budget.kept.includes('lifecycle') ? lifecycleRecords : [],
    comparison,
    historicalWhatMatters,
    conclusionChange,
    omitted,
    charactersUsed: budget.used,
  };
}

/** Attach comparison after current analysis is persisted. */
export function attachComparisonToContext(
  bundle: MemoryContextBundle,
  current: import('../types').PersistedReasonedAnalysis,
): MemoryContextBundle {
  const previous = bundle.previousAnalyses.find(a => a.id !== current.id) ?? bundle.previousAnalyses[0];
  if (!previous || previous.id === current.id) {
    const comparison = buildAnalysisComparison({
      current,
      previous: null,
      lifecycles: bundle.lifecycleRecords,
    });
    return {
      ...bundle,
      comparison,
      historicalWhatMatters: buildHistoricalWhatMatters({
        current,
        comparison,
        lifecycles: bundle.lifecycleRecords,
      }),
    };
  }
  const comparison = buildAnalysisComparison({
    current,
    previous,
    lifecycles: bundle.lifecycleRecords,
  });
  return {
    ...bundle,
    comparison,
    historicalWhatMatters: buildHistoricalWhatMatters({
      current,
      comparison,
      lifecycles: bundle.lifecycleRecords,
    }),
    conclusionChange: explainConclusionChange({ current, previous }),
  };
}
