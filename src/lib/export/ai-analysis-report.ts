/**
 * Maps cached / freshly fetched AI analysis into the PDF/Excel report shape.
 */

import {
  CONFIDENCE_LABELS,
  formatMetricValue,
  requestAnalysis,
  segmentNarrative,
  SEVERITY_LABELS,
  type AiAnalysisData,
  type AiAnalyzeRequest,
} from '@/lib/ai-client';
import type {
  ReportAiAnalysis,
  ReportAiScope,
  ReportPayload,
} from '@/lib/export/download-report';
import {
  buildAiAnalysisCacheKey,
  useAiAnalysisStore,
  type AiAnalysisScope,
} from '@/stores/ai-analysis-store';
import { useWalletStore } from '@/stores/wallet-store';

export type { ReportAiAnalysis, ReportAiScope };

function formatGeneratedAtFull(generatedAt: number): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Convert an analysis API payload into printable report sections. */
export function buildReportAiAnalysis(data: AiAnalysisData): ReportAiAnalysis {
  const narrative = segmentNarrative(data.narrative);
  const confidenceLabel = CONFIDENCE_LABELS[data.confidence] ?? data.confidence;
  const sourceLabel = data.source === 'llm' ? 'AI narrative' : 'Deterministic narrative';

  return {
    periodLabel: data.periodLabel || `${data.periodDays}d`,
    confidenceLabel,
    sourceLabel,
    generatedAtLabel: formatGeneratedAtFull(data.generatedAt),
    summaryRows: [
      { label: 'Period', value: data.periodLabel || `${data.periodDays}d` },
      { label: 'Confidence', value: confidenceLabel },
      { label: 'Source', value: sourceLabel },
      { label: 'Findings', value: String(data.insights.length) },
      { label: 'Metrics', value: String(data.metrics.length) },
      ...(data.generatedAt
        ? [{ label: 'Analyzed at', value: formatGeneratedAtFull(data.generatedAt) }]
        : []),
    ],
    narrativeSections: narrative.sections.map(section => ({
      title: section.title,
      paragraphs: section.paragraphs,
      bullets: section.bullets,
    })),
    confidenceNote: narrative.confidenceNote,
    findingsTable: {
      title: 'Key Findings',
      headers: ['Title', 'Severity', 'Confidence', 'Description', 'Impact'],
      rows: data.insights.map(insight => [
        insight.title,
        SEVERITY_LABELS[insight.severity] ?? insight.severity,
        CONFIDENCE_LABELS[insight.confidence] ?? insight.confidence,
        insight.description,
        insight.impact ??
          (insight.impactUsd != null ? formatMetricValue(insight.impactUsd, 'usd') : ''),
      ]),
    },
    metricsTable: {
      title: 'Analysis Metrics',
      headers: ['Metric', 'Value', 'Engine'],
      rows: data.metrics.map(metric => [
        metric.label,
        formatMetricValue(metric.value, metric.unit),
        metric.engine,
      ]),
    },
  };
}

function resolveScope(scope: ReportAiScope): AiAnalysisScope | null {
  const walletId = scope.walletId ?? useWalletStore.getState().activeWalletId;
  if (!walletId) return null;
  return {
    walletId,
    page: scope.page,
    sectionType: scope.sectionType,
    sectionTitle: scope.sectionTitle,
    asset: scope.asset,
    network: scope.network,
    counterparty: scope.counterparty,
    typeId: scope.typeId,
    period: scope.period,
    filters: scope.filters,
    includeHidden: scope.includeHidden,
  };
}

/**
 * Attach AI analysis to a report payload.
 * Prefers the in-memory cache from AI Data Analysis; otherwise fetches once.
 * Export still proceeds if analysis is unavailable.
 */
export async function enrichReportPayloadWithAi(
  payload: ReportPayload,
  scope?: ReportAiScope | null,
): Promise<{ payload: ReportPayload; aiIncluded: boolean }> {
  if (payload.aiAnalysis) {
    return { payload, aiIncluded: true };
  }

  const resolvedScope = resolveScope(scope ?? payload.aiScope ?? {});
  if (!resolvedScope) {
    return { payload, aiIncluded: false };
  }

  const store = useAiAnalysisStore.getState();
  let data = store.getAnalysis(resolvedScope);

  if (!data) {
    try {
      const request: AiAnalyzeRequest = {
        walletId: resolvedScope.walletId,
        page: resolvedScope.page,
        sectionType: resolvedScope.sectionType,
        sectionTitle: resolvedScope.sectionTitle,
        asset: resolvedScope.asset,
        network: resolvedScope.network,
        counterparty: resolvedScope.counterparty,
        typeId: resolvedScope.typeId,
        period: resolvedScope.period,
        filters: resolvedScope.filters,
        includeHidden: resolvedScope.includeHidden,
      };
      data = await requestAnalysis(request);
      store.setAnalysis(resolvedScope, data);
    } catch (err) {
      console.warn(
        '[Sentinel] AI analysis unavailable for export',
        buildAiAnalysisCacheKey(resolvedScope),
        err,
      );
      return { payload, aiIncluded: false };
    }
  }

  return {
    payload: {
      ...payload,
      aiAnalysis: buildReportAiAnalysis(data),
    },
    aiIncluded: true,
  };
}

/** Convenience for pages: set scope on the payload before download. */
export function withAiScope(
  payload: ReportPayload,
  scope: ReportAiScope,
): ReportPayload {
  return { ...payload, aiScope: scope };
}
