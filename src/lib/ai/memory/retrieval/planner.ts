import { MEMORY_DEFAULTS, PREFERENCE_KEYS, type PreferenceKey } from '../config';
import type { MemoryRetrievalPlan } from '../types';

export function planMemoryRetrieval(input: {
  question: string;
  mode: string;
  conversationId?: string | null;
  walletId?: string | null;
  analysisType?: string;
  page?: string | null;
}): MemoryRetrievalPlan {
  const q = input.question.toLowerCase();
  const historical =
    /what changed|since last|previous|last time|worsen|improv|resolv|persist|history|compare/i.test(
      q,
    );
  const followUp =
    /^(why|and |also |that |the previous|it |them |those )/i.test(input.question.trim()) ||
    /\b(that asset|the previous issue|largest risk|why did it)\b/i.test(q);
  const directValue = /how much|what is .+ worth|price of|allocation of/i.test(q) && !historical;

  const prefKeys: PreferenceKey[] = ['language', 'response_style', 'analysis_depth', 'fiat_currency'];

  return {
    conversation: {
      required: Boolean(input.conversationId) || followUp || input.mode === 'chat',
      conversationId: input.conversationId ?? undefined,
      recentMessageLimit: MEMORY_DEFAULTS.recentMessageLimit,
      includeSummary: true,
    },
    preferences: {
      required: true,
      keys: directValue ? (['language', 'fiat_currency'] as PreferenceKey[]) : prefKeys,
    },
    previousAnalyses: {
      required: historical || input.mode === 'dashboard' || followUp,
      walletId: input.walletId ?? undefined,
      analysisType: input.analysisType,
      sameScopeOnly: true,
      limit: historical ? MEMORY_DEFAULTS.maxHistoricalAnalyses : 1,
    },
    lifecycle: {
      required: historical || followUp || input.mode === 'dashboard',
      activeOnly: !historical,
    },
    tokenBudget: {
      maxCharacters: MEMORY_DEFAULTS.maxMemoryContextCharacters,
      maxHistoricalAnalyses: MEMORY_DEFAULTS.maxHistoricalAnalyses,
      maxLifecycleRecords: MEMORY_DEFAULTS.maxLifecycleRecords,
    },
  };
}

export function intentNeedsLifecycle(question: string): boolean {
  return /changed|worsen|improv|resolv|persist|since last|history/i.test(question);
}

void PREFERENCE_KEYS;
