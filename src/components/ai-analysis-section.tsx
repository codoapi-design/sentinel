'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  Copy,
  LogIn,
  RefreshCw,
  Sparkles,
  WalletMinimal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWalletStore } from '@/stores/wallet-store';
import {
  AiRequestError,
  CONFIDENCE_COLORS,
  CONFIDENCE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  copyText,
  describeAiError,
  formatEvidenceValue,
  formatGeneratedAt,
  formatMetricValue,
  humanizeToolName,
  requestAnalysis,
  segmentNarrative,
  type AiAnalysisData,
  type AiErrorKind,
  type AiInsight,
  type AiNarrativeSection,
} from '@/lib/ai-client';
import { cn } from '@/lib/utils';
import { useAiAnalysisStore } from '@/stores/ai-analysis-store';

interface AIAnalysisSectionProps {
  /** Rows currently visible in the page table — used for context, not for analysis input. */
  transactions?: unknown[];
  clients?: unknown[];
  sectionTitle?: string;
  sectionColor?: string;
  sectionType?: string;
  /** Externally managed result, used by the overlay mount. */
  analysis?: AiAnalysisData | null;
  isLoading?: boolean;
  onClose?: () => void;
  isOverlay?: boolean;
  /** Any change to a non-zero value re-runs the analysis. */
  triggerKey?: number;

  // Context the page knows about — forwarded to the agent.
  walletId?: string;
  asset?: string;
  network?: string;
  counterparty?: string;
  typeId?: string;
  period?: string | number;
  page?: string;
  filters?: Record<string, string | number | boolean | null>;
  includeHidden?: boolean;
}

/** Metrics shown before the "Show all" toggle. */
const VISIBLE_METRICS = 8;

export function AIAnalysisSection({
  transactions,
  sectionTitle,
  sectionColor = '#0052ff',
  sectionType,
  analysis: externalAnalysis,
  isLoading: externalLoading,
  onClose,
  isOverlay = false,
  triggerKey = 0,
  walletId,
  asset,
  network,
  counterparty,
  typeId,
  period,
  page,
  filters,
  includeHidden,
}: AIAnalysisSectionProps) {
  const activeWalletId = useWalletStore(state => state.activeWalletId);
  const resolvedWalletId = walletId ?? activeWalletId ?? null;
  const publishAnalysis = useAiAnalysisStore(state => state.setAnalysis);

  const [result, setResult] = useState<AiAnalysisData | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<AiRequestError | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analysis = externalAnalysis ?? result;
  const isLoading = externalLoading ?? isRunning;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!resolvedWalletId) {
      setError(new AiRequestError('Connect a wallet before running an analysis.', 400));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setShowAllMetrics(false);

    try {
      const data = await requestAnalysis(
        {
          walletId: resolvedWalletId,
          sectionType,
          sectionTitle,
          page,
          asset,
          network,
          counterparty,
          typeId,
          period,
          filters: buildFilters(filters, transactions),
          includeHidden,
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      setResult(data);
      publishAnalysis(
        {
          walletId: resolvedWalletId,
          sectionType,
          sectionTitle,
          page,
          asset,
          network,
          counterparty,
          typeId,
          period,
          filters: buildFilters(filters, transactions),
          includeHidden,
        },
        data,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setResult(null);
      setError(
        err instanceof AiRequestError
          ? err
          : new AiRequestError('Analysis failed unexpectedly. Please try again.', 500)
      );
    } finally {
      if (!controller.signal.aborted) setIsRunning(false);
    }
  }, [
    resolvedWalletId,
    sectionType,
    sectionTitle,
    page,
    asset,
    network,
    counterparty,
    typeId,
    period,
    filters,
    transactions,
    includeHidden,
    publishAnalysis,
  ]);

  // Only a change in `triggerKey` re-runs; context props changing must not.
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (isOverlay || triggerKey <= 0 || triggerKey === lastTriggerRef.current) return;
    lastTriggerRef.current = triggerKey;
    void runAnalysis();
  }, [triggerKey, isOverlay, runAnalysis]);

  const handleCopy = useCallback(async () => {
    if (!analysis) return;
    const ok = await copyText(analysis.narrative);
    if (!ok) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [analysis]);

  const body = (
    <>
      {isLoading && <AnalysisSkeleton accent={sectionColor} sectionTitle={sectionTitle} />}

      {!isLoading && error && (
        <AnalysisError error={error} onRetry={() => void runAnalysis()} />
      )}

      {!isLoading && !error && analysis && (
        <AnalysisResult
          analysis={analysis}
          accent={sectionColor}
          sectionTitle={sectionTitle}
          showAllMetrics={showAllMetrics}
          onToggleMetrics={() => setShowAllMetrics(value => !value)}
          copied={copied}
          onCopy={() => void handleCopy()}
          onRerun={isOverlay ? undefined : () => void runAnalysis()}
        />
      )}
    </>
  );

  if (isOverlay) {
    if (!analysis && !isLoading) return null;

    return (
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="w-full max-w-3xl space-y-3" dir="ltr">
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
              onClick={onClose}
              aria-label="Close analysis"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="ltr">
      <div className="flex items-center justify-center">
        <Button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={isLoading || !resolvedWalletId}
          className="gap-2 bg-[#0052ff] hover:bg-[#0045dd] text-white rounded-xl px-6 h-11 disabled:opacity-50"
          data-testid="ai-analysis-trigger"
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <BarChart3 className="h-4 w-4" />
          )}
          {isLoading ? 'Analyzing…' : analysis ? 'Re-analyze' : 'AI Data Analysis'}
        </Button>
      </div>

      {!resolvedWalletId && !analysis && !isLoading && (
        <p className="text-center text-xs text-[#8a8f98]">
          Connect a wallet to run an analysis of this view.
        </p>
      )}

      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

interface AnalysisResultProps {
  analysis: AiAnalysisData;
  accent: string;
  sectionTitle?: string;
  showAllMetrics: boolean;
  onToggleMetrics: () => void;
  copied: boolean;
  onCopy: () => void;
  onRerun?: () => void;
}

function AnalysisResult({
  analysis,
  accent,
  sectionTitle,
  showAllMetrics,
  onToggleMetrics,
  copied,
  onCopy,
  onRerun,
}: AnalysisResultProps) {
  const narrative = useMemo(() => segmentNarrative(analysis.narrative), [analysis.narrative]);

  const sectionsByTitle = useMemo(() => {
    const map = new Map<string, AiNarrativeSection>();
    for (const section of narrative.sections) map.set(section.title, section);
    return map;
  }, [narrative.sections]);

  const summary = sectionsByTitle.get('Summary');
  const keyFindings = sectionsByTitle.get('Key Findings');
  const evidence = sectionsByTitle.get('Evidence');
  const interpretation = sectionsByTitle.get('Interpretation');
  const monitoring = sectionsByTitle.get('Monitoring Points');

  const metrics = showAllMetrics ? analysis.metrics : analysis.metrics.slice(0, VISIBLE_METRICS);
  const hasMoreMetrics = analysis.metrics.length > VISIBLE_METRICS;

  const qualityNote = buildQualityNote(analysis);

  return (
    <div
      className="rounded-xl border bg-[#0f1011] overflow-hidden"
      style={{ borderColor: `${accent}26` }}
      data-testid="ai-analysis-result"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accent}1a` }}
          >
            <Sparkles className="h-[18px] w-[18px]" style={{ color: accent }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#f7f8f8] truncate">
              {sectionTitle ? `${sectionTitle} analysis` : 'Wallet analysis'}
            </p>
            <p className="text-[11px] text-[#8a8f98]">
              {analysis.periodLabel}
              {analysis.insights.length > 0
                ? ` · ${analysis.insights.length} finding${analysis.insights.length === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ConfidenceBadge analysis={analysis} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
            onClick={onCopy}
            title="Copy analysis"
            aria-label="Copy analysis"
          >
            {copied ? <Check className="h-4 w-4 text-[#0ecb81]" /> : <Copy className="h-4 w-4" />}
          </Button>
          {onRerun && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
              onClick={onRerun}
              title="Re-analyze"
              aria-label="Re-analyze"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Summary */}
        {summary && (summary.paragraphs.length > 0 || summary.bullets.length > 0) && (
          <Block title="Summary">
            <div className="space-y-2">
              {summary.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-[#d0d6e0]">
                  {paragraph}
                </p>
              ))}
              {summary.bullets.length > 0 && <BulletList items={summary.bullets} accent={accent} />}
            </div>
          </Block>
        )}

        {/* Key findings — structured insights first, narrative bullets as fallback */}
        {analysis.insights.length > 0 ? (
          <Block title="Key Findings">
            <div className="space-y-2.5">
              {analysis.insights.map(insight => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </div>
          </Block>
        ) : (
          keyFindings &&
          keyFindings.bullets.length > 0 && (
            <Block title="Key Findings">
              <BulletList items={keyFindings.bullets} accent={accent} />
            </Block>
          )
        )}

        {/* Evidence */}
        {(metrics.length > 0 || (evidence && evidence.bullets.length > 0)) && (
          <Block title="Evidence">
            <div className="space-y-3">
              {metrics.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {metrics.map(metric => (
                    <div
                      key={`${metric.engine}:${metric.key}`}
                      className="rounded-lg bg-[#191a1b] border border-white/5 px-3 py-2.5"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-[#8a8f98] truncate" title={metric.label}>
                        {metric.label}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[#f7f8f8] font-mono-num truncate">
                        {formatMetricValue(metric.value, metric.unit)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {hasMoreMetrics && (
                <button
                  type="button"
                  onClick={onToggleMetrics}
                  className="text-[11px] text-[#8a8f98] hover:text-[#d0d6e0] transition-colors"
                >
                  {showAllMetrics
                    ? 'Show fewer metrics'
                    : `Show all ${analysis.metrics.length} metrics`}
                </button>
              )}

              {evidence && evidence.bullets.length > 0 && (
                <BulletList items={evidence.bullets} accent={accent} />
              )}
            </div>
          </Block>
        )}

        {/* Interpretation */}
        {interpretation && (interpretation.paragraphs.length > 0 || interpretation.bullets.length > 0) && (
          <Block title="Interpretation">
            <div className="space-y-2">
              {interpretation.paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-[#d0d6e0]">
                  {paragraph}
                </p>
              ))}
              {interpretation.bullets.length > 0 && (
                <BulletList items={interpretation.bullets} accent={accent} />
              )}
            </div>
          </Block>
        )}

        {/* Monitoring points */}
        {monitoring && (monitoring.bullets.length > 0 || monitoring.paragraphs.length > 0) && (
          <Block title="Monitoring Points">
            <BulletList
              items={[...monitoring.bullets, ...monitoring.paragraphs]}
              accent={accent}
            />
          </Block>
        )}

        {narrative.confidenceNote && (
          <p className="text-[11px] text-[#8a8f98] leading-relaxed">{narrative.confidenceNote}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/5 bg-[#0c0d0e] space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#8a8f98]">
          <span className="capitalize">{humanizeMode(analysis.analysisMode)} analysis</span>
          <span>·</span>
          <span>{analysis.periodLabel}</span>
          <span>·</span>
          <span title={analysis.toolsUsed.map(humanizeToolName).join(', ')}>
            {analysis.toolsUsed.length} engine{analysis.toolsUsed.length === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>{formatGeneratedAt(analysis.generatedAt)}</span>
          <span>·</span>
          <span>{analysis.source === 'llm' ? 'Radareum AI' : 'Radareum engine'}</span>
        </div>
        {qualityNote && <p className="text-[11px] text-[#8a8f98]/80 leading-relaxed">{qualityNote}</p>}
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: AiInsight }) {
  const evidenceEntries = Object.entries(insight.evidence).slice(0, 4);

  return (
    <div className="rounded-lg border border-white/5 bg-[#191a1b] px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#f7f8f8] leading-snug">{insight.title}</p>
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
            SEVERITY_STYLES[insight.severity]
          )}
        >
          {SEVERITY_LABELS[insight.severity]}
        </span>
      </div>

      {insight.description && (
        <p className="mt-1 text-xs leading-relaxed text-[#8a8f98]">{insight.description}</p>
      )}

      {insight.impact && (
        <p className="mt-1.5 text-xs leading-relaxed text-[#d0d6e0]">{insight.impact}</p>
      )}

      {evidenceEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidenceEntries.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[#8a8f98]"
            >
              <span>{humanizeEvidenceKey(key)}</span>
              <span className="text-[#d0d6e0] font-mono-num">{formatEvidenceValue(value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ analysis }: { analysis: AiAnalysisData }) {
  const color = CONFIDENCE_COLORS[analysis.confidence];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium"
      style={{ backgroundColor: `${color}14`, color }}
      title={`Data completeness ${Math.round(analysis.dataQuality.completeness)}%`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {CONFIDENCE_LABELS[analysis.confidence]}
    </span>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8f98] mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function BulletList({ items, accent }: { items: string[]; accent: string }) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm leading-relaxed text-[#d0d6e0]">
          <span
            className="mt-[7px] w-1 h-1 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />
          <span className="whitespace-pre-wrap">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Loading and error states
// ---------------------------------------------------------------------------

function AnalysisSkeleton({ accent, sectionTitle }: { accent: string; sectionTitle?: string }) {
  return (
    <div
      className="rounded-xl border bg-[#0f1011] overflow-hidden"
      style={{ borderColor: `${accent}26` }}
      data-testid="ai-analysis-loading"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}1a` }}
        >
          <Sparkles className="h-[18px] w-[18px] animate-pulse" style={{ color: accent }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#f7f8f8]">
            Analyzing {sectionTitle ?? 'your wallet'}…
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff] animate-pulse-dot" />
            <span className="text-[11px] text-[#8a8f98]">
              Reading verified wallet data and running the intelligence engines
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        <div className="space-y-2">
          <ShimmerBar className="w-24 h-2.5" />
          <ShimmerBar className="w-full h-3" />
          <ShimmerBar className="w-[92%] h-3" />
          <ShimmerBar className="w-[64%] h-3" />
        </div>
        <div className="space-y-2">
          <ShimmerBar className="w-28 h-2.5" />
          <ShimmerBar className="w-full h-12 rounded-lg" />
          <ShimmerBar className="w-full h-12 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <ShimmerBar key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShimmerBar({ className }: { className?: string }) {
  return <div className={cn('rounded bg-white/[0.06] animate-pulse', className)} />;
}

function AnalysisError({ error, onRetry }: { error: AiRequestError; onRetry: () => void }) {
  const { kind, title, message, retryable } = describeAiError(error);
  const Icon = ERROR_ICONS[kind];

  return (
    <div
      className="rounded-xl border border-[#f6465d]/20 bg-[#f6465d]/[0.04] px-5 py-4"
      data-testid="ai-analysis-error"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#f6465d]/10 flex items-center justify-center shrink-0">
          <Icon className="h-[18px] w-[18px] text-[#f6465d]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#f7f8f8]">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#8a8f98] break-words">{message}</p>
          {retryable && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 bg-[#191a1b] border-white/10 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ERROR_ICONS: Record<AiErrorKind, typeof AlertCircle> = {
  auth: LogIn,
  wallet: WalletMinimal,
  input: WalletMinimal,
  failure: AlertCircle,
};

function buildQualityNote(analysis: AiAnalysisData): string | null {
  const parts: string[] = [];
  const quality = analysis.dataQuality;

  if (quality.truncated) {
    const total = quality.totalTransactionCount;
    parts.push(
      total
        ? `Covers the most recent ${quality.loadedTransactionCount.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} transactions.`
        : `Covers the most recent ${quality.loadedTransactionCount.toLocaleString('en-US')} transactions.`
    );
  }

  if (quality.completeness > 0 && quality.completeness < 80) {
    parts.push(`${Math.round(quality.completeness)}% of rows had a usable USD price.`);
  }

  if (parts.length === 0 && quality.notes.length > 0) {
    parts.push(quality.notes[0]);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function buildFilters(
  filters: Record<string, string | number | boolean | null> | undefined,
  transactions: unknown[] | undefined
): Record<string, string | number | boolean | null> | undefined {
  const merged: Record<string, string | number | boolean | null> = { ...(filters ?? {}) };
  if (Array.isArray(transactions)) merged.rowsInView = transactions.length;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function humanizeMode(mode: string): string {
  return mode.replace(/[_-]/g, ' ');
}

function humanizeEvidenceKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
