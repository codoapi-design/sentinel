/**
 * Caches the latest AI Data Analysis per page scope so PDF/Excel exports can
 * reuse a result the user already ran (or that export just fetched).
 */

import { create } from 'zustand';
import type { AiAnalysisData, AiPageContext } from '@/lib/ai-client';

export type AiAnalysisScope = AiPageContext & {
  walletId: string;
  includeHidden?: boolean;
};

export function buildAiAnalysisCacheKey(scope: AiAnalysisScope): string {
  const parts = [
    scope.walletId,
    scope.page ?? '',
    scope.sectionType ?? '',
    scope.asset ?? '',
    scope.network ?? '',
    scope.counterparty ?? '',
    scope.typeId ?? '',
    String(scope.period ?? ''),
    scope.includeHidden === true ? 'hidden' : '',
  ];
  if (scope.filters && Object.keys(scope.filters).length > 0) {
    const entries = Object.entries(scope.filters)
      .filter(([, v]) => v != null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`);
    parts.push(entries.join('&'));
  }
  return parts.join('|');
}

interface AiAnalysisStoreState {
  byKey: Record<string, AiAnalysisData>;
  /** Most recently published analysis (any scope). */
  latestKey: string | null;
  setAnalysis: (scope: AiAnalysisScope, data: AiAnalysisData) => void;
  getAnalysis: (scope: AiAnalysisScope) => AiAnalysisData | null;
  clearWallet: (walletId: string) => void;
}

export const useAiAnalysisStore = create<AiAnalysisStoreState>((set, get) => ({
  byKey: {},
  latestKey: null,

  setAnalysis: (scope, data) => {
    const key = buildAiAnalysisCacheKey(scope);
    set(state => ({
      byKey: { ...state.byKey, [key]: data },
      latestKey: key,
    }));
  },

  getAnalysis: scope => {
    const key = buildAiAnalysisCacheKey(scope);
    return get().byKey[key] ?? null;
  },

  clearWallet: walletId => {
    set(state => {
      const next: Record<string, AiAnalysisData> = {};
      for (const [key, value] of Object.entries(state.byKey)) {
        if (!key.startsWith(`${walletId}|`)) next[key] = value;
      }
      const latestKey =
        state.latestKey && state.latestKey.startsWith(`${walletId}|`)
          ? null
          : state.latestKey;
      return { byKey: next, latestKey };
    });
  },
}));
