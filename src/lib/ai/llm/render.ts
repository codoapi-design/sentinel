/**
 * Radareum AI — Deterministic Narrative Renderer
 *
 * The no-LLM path. Turns a structured intelligence result into professional
 * English prose following the Spec response structure (Part 4 §4.15,
 * Module 10 §5.165): Summary, Key Findings, Evidence, Interpretation,
 * Monitoring Points — plus the short Telegram Daily Brief (Part 7 §7.6).
 *
 * Rules honoured here:
 *   - Nothing is invented. Every figure and every claim comes from the input.
 *   - No advice, no predictions, no danger/judgement language (Part 7 §7.7).
 *   - Fully deterministic: same input produces the same text, byte for byte.
 *   - Empty input yields the honest "not enough data" response (Part 4 §4.16).
 *
 * The input type is a structural, minimal contract. It is intentionally
 * decoupled from `@/lib/ai/intelligence` so the two layers can evolve
 * independently while staying compatible by shape.
 */

import type { AgentMode, RuntimeContext } from './prompts';

// ---------------------------------------------------------------------------
// Structural input contract
// ---------------------------------------------------------------------------

/** `info` and `informational` are accepted as the same level. */
export type Severity = 'info' | 'informational' | 'low' | 'medium' | 'high' | 'critical';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** `pct` is an accepted alias of `percent`; `score` renders as a plain number. */
export type MetricUnit =
  | 'usd'
  | 'percent'
  | 'pct'
  | 'ratio'
  | 'score'
  | 'count'
  | 'token'
  | 'days'
  | 'text';

export interface NarrativeMetric {
  label?: string;
  value: number | string | null;
  /** When omitted the unit is inferred from the metric key. */
  unit?: MetricUnit;
  symbol?: string;
  previousValue?: number | null;
  change?: number | null;
  changePercent?: number | null;
  period?: string;
}

export type NarrativeMetricValue = number | string | boolean | null | undefined | NarrativeMetric;

/**
 * Metric bags are accepted as-is from any intelligence engine, including
 * interfaces with nested shapes. Values the renderer cannot express as a
 * single figure are skipped rather than rejected, which keeps this layer
 * structurally compatible with richer result types.
 */
export type NarrativeMetrics = Record<string, NarrativeMetricValue> | Record<string, unknown> | object;

export interface NarrativePattern {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  detected?: boolean;
  severity?: Severity;
  confidence?: ConfidenceLevel | number;
}

export type NarrativeEvidence = string | string[] | Record<string, unknown>;

export interface NarrativeInsight {
  id?: string;
  title: string;
  description?: string;
  severity?: Severity;
  confidence?: ConfidenceLevel | number;
  evidence?: NarrativeEvidence;
  period?: string;
}

export interface NarrativeDataQuality {
  level?: ConfidenceLevel | 'unknown';
  /** 0–1 or 0–100; both scales are accepted. */
  score?: number;
  completeness?: number;
  issues?: string[];
  limitations?: string[];
  missing?: string[];
  syncStatus?: string;
  lastSyncedAt?: string;
}

/**
 * Minimal shape the renderer needs. Any richer intelligence result that
 * carries these fields is structurally compatible.
 */
export interface NarrativeIntelligence {
  module?: string;
  title?: string;
  summary?: string;
  period?: string;
  metrics?: NarrativeMetrics;
  patterns?: NarrativePattern[];
  insights?: NarrativeInsight[];
  /** Headline numbers backing the summary. */
  evidence?: NarrativeEvidence;
  monitoringPoints?: string[];
  dataQuality?: NarrativeDataQuality;
  confidence?: ConfidenceLevel | number;
}

export interface RenderNarrativeArgs {
  mode: AgentMode;
  intelligence?: NarrativeIntelligence | NarrativeIntelligence[] | null;
  runtimeContext?: RuntimeContext;
  /** Page or section the analysis belongs to, e.g. "Portfolio". */
  section?: string;
  period?: string;
  /** Reference instant for relative dates. Defaults to `new Date()`. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Number and date formatting (Part 7 §7.3 "NUMBER PRESENTATION")
// ---------------------------------------------------------------------------

const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const GROUPED_CENTS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const UP_TO_FOUR = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function compactUsd(abs: number): string | null {
  if (abs >= 1e12) return `$${ONE_DECIMAL.format(abs / 1e12)}T`;
  if (abs >= 1e9) return `$${ONE_DECIMAL.format(abs / 1e9)}B`;
  if (abs >= 1e6) return `$${ONE_DECIMAL.format(abs / 1e6)}M`;
  return null;
}

/** `$68,150` · `$4.82` · `$1.2M` — cents only below $1,000. */
export function formatUsd(value: number, options: { signed?: boolean } = {}): string {
  if (!isFiniteNumber(value)) return 'n/a';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : options.signed ? '+' : '';

  if (abs === 0) return `${options.signed ? '+' : ''}$0`;
  if (abs < 0.01) return `${sign}<$0.01`;

  const compact = compactUsd(abs);
  if (compact) return `${sign}${compact}`;
  if (abs >= 1000) return `${sign}$${GROUPED.format(abs)}`;
  return `${sign}$${GROUPED_CENTS.format(abs)}`;
}

/** One decimal, per Spec: `6.4%`, `+4.2%`. */
export function formatPercent(value: number, options: { signed?: boolean } = {}): string {
  if (!isFiniteNumber(value)) return 'n/a';
  const sign = value < 0 ? '-' : options.signed ? '+' : '';
  return `${sign}${ONE_DECIMAL.format(Math.abs(value))}%`;
}

export function formatCount(value: number): string {
  if (!isFiniteNumber(value)) return 'n/a';
  return GROUPED.format(value);
}

/** Max four decimals, per Spec: `1.2345 ETH`. */
export function formatTokenAmount(value: number, symbol?: string): string {
  if (!isFiniteNumber(value)) return 'n/a';
  const amount = UP_TO_FOUR.format(value);
  return symbol ? `${amount} ${symbol}` : amount;
}

/** Never print a full address: `0x1a2b…9f3c`. */
export function maskAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function formatAbsoluteDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Relative when recent, absolute otherwise (Part 7 §7.3). */
export function formatRelativeDate(value: string | Date, now: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : 'n/a';

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays < 0) return formatAbsoluteDate(date);
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / 3_600_000);
    if (diffHours <= 0) return 'less than an hour ago';
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return '1 day ago';
  if (diffDays <= 30) return `${diffDays} days ago`;
  return formatAbsoluteDate(date);
}

// ---------------------------------------------------------------------------
// Key humanisation
// ---------------------------------------------------------------------------

const ACRONYMS = new Set([
  'usd', 'usdc', 'usdt', 'roi', 'apy', 'apr', 'ath', 'atl', 'nft', 'tvl',
  'dex', 'cex', 'eth', 'btc', 'sol', 'id', 'gas', 'cagr',
]);

const ACRONYM_OVERRIDES: Record<string, string> = { pnl: 'P&L' };

/** Unit suffixes are dropped: the formatted value already shows `$` or `%`. */
const REDUNDANT_SUFFIXES = new Set(['usd', 'pct', 'percent', 'percentage']);

/** `totalValueUsd` → `Total Value`, `stablecoin_share_pct` → `Stablecoin Share`. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length > 1 && REDUNDANT_SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYM_OVERRIDES[lower]) return ACRONYM_OVERRIDES[lower];
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

const USD_KEY = /(usd|value|pnl|profit|loss|volume|fee|fees|cost|flow|deposits|withdrawals|balance|revenue|gain)$/i;
const PERCENT_KEY = /(pct|percent|percentage|roi|share|weight|allocation|concentration|ratio|rate|growth|drawdown|change)$/i;
const COUNT_KEY = /(count|assets|networks|trades|transactions|transfers|days|holdings|interactions|alerts)$/i;

function inferUnit(key: string, value: number): MetricUnit {
  if (PERCENT_KEY.test(key)) return 'percent';
  if (USD_KEY.test(key)) return 'usd';
  if (COUNT_KEY.test(key)) return 'count';
  return Number.isInteger(value) ? 'count' : 'text';
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

interface NormalizedMetric {
  key: string;
  label: string;
  display: string;
  changeDisplay: string | null;
  unit: MetricUnit;
  numericValue: number | null;
}

function formatMetricValue(value: number, unit: MetricUnit, symbol?: string): string {
  switch (unit) {
    case 'usd':
      return formatUsd(value);
    case 'percent':
    case 'pct':
      return formatPercent(value);
    case 'ratio':
      return formatPercent(value * 100);
    case 'score':
      return UP_TO_FOUR.format(value);
    case 'count':
      return formatCount(value);
    case 'token':
      return formatTokenAmount(value, symbol);
    case 'days':
      return value === 1 ? '1 day' : `${formatCount(value)} days`;
    default:
      return UP_TO_FOUR.format(value);
  }
}

function normalizeMetric(key: string, raw: unknown): NormalizedMetric | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const unit = inferUnit(key, raw);
    return {
      key,
      label: humanizeKey(key),
      display: formatMetricValue(raw, unit),
      changeDisplay: null,
      unit,
      numericValue: raw,
    };
  }

  if (typeof raw === 'string' || typeof raw === 'boolean') {
    const text = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : raw.trim();
    if (text.length === 0) return null;
    return {
      key,
      label: humanizeKey(key),
      display: text,
      changeDisplay: null,
      unit: 'text',
      numericValue: null,
    };
  }

  // Anything that is not a metric object (arrays, nested results) is skipped.
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const metric = raw as NarrativeMetric;
  const label = (typeof metric.label === 'string' && metric.label.trim()) || humanizeKey(key);

  if (metric.value === null || metric.value === undefined) return null;

  if (typeof metric.value === 'string') {
    const text = metric.value.trim();
    if (text.length === 0) return null;
    return { key, label, display: text, changeDisplay: null, unit: 'text', numericValue: null };
  }

  if (!isFiniteNumber(metric.value)) return null;

  const unit = typeof metric.unit === 'string' ? metric.unit : inferUnit(key, metric.value);
  const parts: string[] = [];

  if (isFiniteNumber(metric.changePercent)) {
    parts.push(formatPercent(metric.changePercent, { signed: true }));
  }
  if (isFiniteNumber(metric.change)) {
    const symbol = typeof metric.symbol === 'string' ? metric.symbol : undefined;
    parts.push(
      unit === 'usd'
        ? formatUsd(metric.change, { signed: true })
        : formatMetricValue(metric.change, unit, symbol)
    );
  }

  const period = typeof metric.period === 'string' ? metric.period.trim() : undefined;
  const changeDisplay =
    parts.length > 0
      ? `(${parts.join(' / ')}${period ? ` · ${period}` : ''})`
      : period
        ? `(${period})`
        : null;

  return {
    key,
    label,
    display: formatMetricValue(metric.value, unit, typeof metric.symbol === 'string' ? metric.symbol : undefined),
    changeDisplay,
    unit,
    numericValue: metric.value,
  };
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
  informational: 0,
};

function severityRank(severity?: Severity): number {
  return severity ? (SEVERITY_RANK[severity] ?? 0) : 0;
}

function toConfidenceLevel(value: ConfidenceLevel | number | undefined): ConfidenceLevel | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'high' || lower === 'medium' || lower === 'low' ? lower : null;
  }
  if (!Number.isFinite(value)) return null;
  const normalized = value > 1 ? value / 100 : value;
  if (normalized >= 0.75) return 'high';
  if (normalized >= 0.5) return 'medium';
  return 'low';
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

interface CollectedInsight extends NarrativeInsight {
  moduleLabel: string;
  order: number;
}

interface CollectedModule {
  label: string;
  source: NarrativeIntelligence;
  metrics: NormalizedMetric[];
}

function moduleLabel(module: NarrativeIntelligence, index: number): string {
  const raw = module.title?.trim() || module.module?.trim();
  if (raw && raw.length > 0) return humanizeKey(raw);
  return `Analysis ${index + 1}`;
}

function toModuleArray(
  intelligence: NarrativeIntelligence | NarrativeIntelligence[] | null | undefined
): NarrativeIntelligence[] {
  if (!intelligence) return [];
  return Array.isArray(intelligence) ? intelligence.filter(Boolean) : [intelligence];
}

function hasContent(module: NarrativeIntelligence): boolean {
  const metricCount = module.metrics ? Object.keys(module.metrics).length : 0;
  return (
    Boolean(module.summary?.trim()) ||
    metricCount > 0 ||
    (module.insights?.length ?? 0) > 0 ||
    (module.patterns?.length ?? 0) > 0 ||
    (module.monitoringPoints?.length ?? 0) > 0
  );
}

function patternLabel(pattern: NarrativePattern): string {
  const raw = pattern.label?.trim() || pattern.name?.trim() || pattern.id?.trim();
  return raw ? humanizeKey(raw) : '';
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function endWithPeriod(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  return /[.!?:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = /^(.*?[.!?])(\s|$)/.exec(trimmed);
  return match ? match[1] : trimmed;
}

function evidenceLines(evidence: NarrativeEvidence | undefined): string[] {
  if (!evidence) return [];
  if (typeof evidence === 'string') return evidence.trim() ? [evidence.trim()] : [];
  if (Array.isArray(evidence)) return dedupe(evidence.map((item) => String(item)));

  const lines: string[] = [];
  for (const [key, value] of Object.entries(evidence)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const normalized = normalizeMetric(key, value as NarrativeMetricValue);
    lines.push(normalized ? `${normalized.label}: ${normalized.display}` : `${humanizeKey(key)}: ${String(value)}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface RenderModel {
  modules: CollectedModule[];
  insights: CollectedInsight[];
  metrics: Array<NormalizedMetric & { moduleLabel: string }>;
  headlineEvidence: string[];
  summaries: string[];
  monitoringPoints: string[];
  confidence: ConfidenceLevel | null;
  limitations: string[];
  staleSyncNote: string | null;
  period: string | null;
  sectionLabel: string;
  multiModule: boolean;
}

function resolvePeriod(args: RenderNarrativeArgs, modules: NarrativeIntelligence[]): string | null {
  const explicit = args.period?.trim();
  if (explicit) return explicit;

  for (const entry of modules) {
    const period = entry.period?.trim();
    if (period) return period;
  }

  const sessionPeriod = args.runtimeContext?.session?.selectedPeriod?.trim();
  return sessionPeriod && sessionPeriod.length > 0 ? sessionPeriod : null;
}

function resolveSectionLabel(args: RenderNarrativeArgs, modules: NarrativeIntelligence[]): string {
  const explicit = args.section?.trim();
  if (explicit) return humanizeKey(explicit);

  const session = args.runtimeContext?.session;
  const fromSession = session?.currentSection?.trim() || session?.currentPage?.trim();
  if (fromSession) return humanizeKey(fromSession);

  if (modules.length === 1) return moduleLabel(modules[0], 0);
  return 'Portfolio';
}

function resolveStaleSyncNote(context: RuntimeContext | undefined, now: Date): string | null {
  const wallet = context?.wallet;
  if (!wallet) return null;

  const status = wallet.syncStatus?.toLowerCase();
  if (!status || status === 'fresh') return null;

  const when = wallet.lastSyncedAt ? formatRelativeDate(wallet.lastSyncedAt, now) : null;
  const suffix = when ? ` The last synchronization completed ${when}.` : '';
  return `The latest wallet synchronization is outdated, so results may not reflect recent blockchain activity.${suffix}`;
}

function buildRenderModel(args: RenderNarrativeArgs, now: Date): RenderModel {
  const rawModules = toModuleArray(args.intelligence).filter(hasContent);

  const modules: CollectedModule[] = [];
  const insights: CollectedInsight[] = [];
  const metrics: Array<NormalizedMetric & { moduleLabel: string }> = [];
  const headlineEvidence: string[] = [];
  const summaries: string[] = [];
  const monitoringPoints: string[] = [];
  const limitations: string[] = [];
  const confidences: ConfidenceLevel[] = [];

  const multiModule = rawModules.length > 1;
  let order = 0;

  rawModules.forEach((module, index) => {
    const label = moduleLabel(module, index);

    const normalizedMetrics: NormalizedMetric[] = [];
    for (const [key, value] of Object.entries(module.metrics ?? {})) {
      const normalized = normalizeMetric(key, value);
      if (normalized) {
        normalizedMetrics.push(normalized);
        metrics.push({ ...normalized, moduleLabel: label });
      }
    }

    modules.push({ label, source: module, metrics: normalizedMetrics });

    for (const line of evidenceLines(module.evidence)) {
      headlineEvidence.push(multiModule ? `${label} · ${line}` : line);
    }

    if (module.summary?.trim()) summaries.push(endWithPeriod(module.summary));

    for (const insight of module.insights ?? []) {
      if (!insight?.title?.trim()) continue;
      insights.push({ ...insight, moduleLabel: label, order: order++ });
    }

    for (const point of module.monitoringPoints ?? []) {
      if (point?.trim()) monitoringPoints.push(endWithPeriod(point));
    }

    for (const pattern of module.patterns ?? []) {
      if (pattern?.detected === false) continue;
      if (severityRank(pattern?.severity) >= SEVERITY_RANK.medium) {
        const name = patternLabel(pattern);
        const description = pattern.description?.trim();
        if (description) monitoringPoints.push(endWithPeriod(description));
        else if (name) monitoringPoints.push(endWithPeriod(`${name} pattern detected in ${label}`));
      }
    }

    const quality = module.dataQuality;
    if (quality) {
      limitations.push(...(quality.issues ?? []), ...(quality.limitations ?? []));
      for (const missing of quality.missing ?? []) {
        if (missing?.trim()) limitations.push(`${missing.trim()} is not available`);
      }
    }

    const moduleConfidence =
      toConfidenceLevel(module.confidence) ??
      toConfidenceLevel(quality?.level as ConfidenceLevel | undefined) ??
      toConfidenceLevel(quality?.score) ??
      toConfidenceLevel(quality?.completeness);

    if (moduleConfidence) confidences.push(moduleConfidence);
  });

  // Highest-severity first; ties keep source order so output stays stable.
  insights.sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;

    const aConfidence = toConfidenceLevel(a.confidence);
    const bConfidence = toConfidenceLevel(b.confidence);
    const byConfidence =
      (bConfidence ? CONFIDENCE_RANK[bConfidence] : 0) - (aConfidence ? CONFIDENCE_RANK[aConfidence] : 0);
    if (byConfidence !== 0) return byConfidence;

    return a.order - b.order;
  });

  const confidence = confidences.length
    ? confidences.reduce((lowest, current) =>
        CONFIDENCE_RANK[current] < CONFIDENCE_RANK[lowest] ? current : lowest
      )
    : null;

  return {
    modules,
    insights,
    metrics,
    headlineEvidence: dedupe(headlineEvidence),
    summaries: dedupe(summaries),
    monitoringPoints: dedupe(monitoringPoints),
    confidence,
    limitations: dedupe(limitations),
    staleSyncNote: resolveStaleSyncNote(args.runtimeContext, now),
    period: resolvePeriod(args, rawModules),
    sectionLabel: resolveSectionLabel(args, rawModules),
    multiModule,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

const MAX_LABEL_WIDTH = 36;

function alignRows(rows: Array<[string, string]>): string[] {
  const width = Math.min(
    rows.reduce((max, [label]) => Math.max(max, label.length + 1), 0),
    MAX_LABEL_WIDTH
  );
  return rows.map(([label, value]) => `${`${label}:`.padEnd(width + 1)} ${value}`.trimEnd());
}

function periodPhrase(period: string | null): string {
  return period ? ` over ${period}` : '';
}

function metricLine(metric: NormalizedMetric): string {
  return metric.changeDisplay ? `${metric.display} ${metric.changeDisplay}` : metric.display;
}

function buildSummary(model: RenderModel): string {
  if (model.summaries.length > 0) return model.summaries.join(' ');

  const parts: string[] = [];
  const headline = model.metrics.find((metric) => metric.unit === 'usd') ?? model.metrics[0];

  if (headline) {
    parts.push(
      endWithPeriod(
        `${model.sectionLabel}${periodPhrase(model.period)}: ${headline.label} is ${metricLine(headline)}`
      )
    );
  } else {
    parts.push(endWithPeriod(`${model.sectionLabel} analysis${periodPhrase(model.period)}`));
  }

  const topInsight = model.insights[0];
  if (topInsight) parts.push(endWithPeriod(topInsight.title));

  return parts.join(' ');
}

function buildKeyFindings(model: RenderModel, limit: number): string[] {
  const lines: string[] = [];

  for (const insight of model.insights.slice(0, limit)) {
    const severity = insight.severity ? ` (${insight.severity})` : '';
    const prefix = model.multiModule ? `${insight.moduleLabel} — ` : '';
    lines.push(`- ${prefix}${endWithPeriod(insight.title).replace(/\.$/, '')}${severity}`);
  }

  if (lines.length === 0) {
    for (const metric of model.metrics.slice(0, limit)) {
      lines.push(`- ${metric.label}: ${metricLine(metric)}`);
    }
  }

  return lines;
}

function buildEvidence(model: RenderModel, limit: number): string[] {
  const rows: Array<[string, string]> = [];

  for (const metric of model.metrics.slice(0, limit)) {
    const label = model.multiModule ? `${metric.moduleLabel} · ${metric.label}` : metric.label;
    rows.push([label, metricLine(metric)]);
  }

  const lines = rows.length > 0 ? alignRows(rows) : [];

  const supporting: string[] = model.headlineEvidence.map((line) => `- ${line}`);
  for (const insight of model.insights.slice(0, 3)) {
    for (const line of evidenceLines(insight.evidence)) supporting.push(`- ${line}`);
  }

  const uniqueSupporting = dedupe(supporting).slice(0, 8);
  if (uniqueSupporting.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...uniqueSupporting);
  }

  return lines;
}

function buildInterpretation(model: RenderModel, limit: number): string[] {
  const paragraphs: string[] = [];

  for (const insight of model.insights.slice(0, limit)) {
    const description = insight.description?.trim();
    if (!description) continue;
    paragraphs.push(endWithPeriod(description));
  }

  if (paragraphs.length === 0) {
    const described = model.metrics.length;
    if (described > 0) {
      paragraphs.push(
        endWithPeriod(
          `The available data covers ${formatCount(described)} ${described === 1 ? 'metric' : 'metrics'}${periodPhrase(
            model.period
          )}. No interpreted findings were produced for this section, so only the measured values are reported above`
        )
      );
    }
  }

  return dedupe(paragraphs);
}

function buildMonitoringPoints(model: RenderModel, limit: number): string[] {
  const points = [...model.monitoringPoints];

  if (points.length === 0) {
    for (const insight of model.insights) {
      if (severityRank(insight.severity) >= SEVERITY_RANK.medium) {
        points.push(endWithPeriod(insight.title));
      }
    }
  }

  return dedupe(points).slice(0, limit).map((point) => `- ${point}`);
}

function buildConfidenceLine(model: RenderModel): string | null {
  if (!model.confidence && model.limitations.length === 0) return null;

  const level = model.confidence ?? 'medium';
  const reason = model.limitations.slice(0, 2).join('; ');
  return reason ? `Confidence: ${level} — ${reason}.` : `Confidence: ${level}.`;
}

// ---------------------------------------------------------------------------
// Mode renderers
// ---------------------------------------------------------------------------

function renderInsufficientData(args: RenderNarrativeArgs, now: Date): string {
  const section = resolveSectionLabel(args, []);
  const period = resolvePeriod(args, []);
  const staleNote = resolveStaleSyncNote(args.runtimeContext, now);

  const available: string[] = [];
  const wallet = args.runtimeContext?.wallet;
  const portfolio = args.runtimeContext?.portfolio;

  if (wallet?.label) available.push(`Wallet: ${wallet.label}`);
  if (wallet?.networks?.length) available.push(`Networks: ${wallet.networks.join(', ')}`);
  if (isFiniteNumber(portfolio?.totalValueUsd)) {
    available.push(`Reported portfolio value: ${formatUsd(portfolio.totalValueUsd)}`);
  }
  if (isFiniteNumber(portfolio?.assetCount)) {
    available.push(`Assets: ${formatCount(portfolio.assetCount)}`);
  }
  if (wallet?.lastSyncedAt) {
    available.push(`Last synchronization: ${formatRelativeDate(wallet.lastSyncedAt, now)}`);
  }

  if (args.mode === 'telegram') {
    const lines = ['Radareum · Update', '', `Not enough data to report on ${section}${periodPhrase(period)}.`];
    if (staleNote) lines.push('', 'The wallet synchronization is outdated.');
    return lines.join('\n');
  }

  const blocks: string[] = [];
  blocks.push(
    `There isn't enough data to analyze ${section}${periodPhrase(period)} accurately.`
  );

  if (available.length > 0) {
    blocks.push(['Here is what is currently available:', ...available.map((item) => `- ${item}`)].join('\n'));
  } else {
    blocks.push('No metrics, patterns, or insights were returned for this section.');
  }

  if (staleNote) blocks.push(staleNote);

  return blocks.join('\n\n');
}

function renderDashboard(model: RenderModel): string {
  const blocks: string[] = [];

  blocks.push(['Summary', buildSummary(model)].join('\n'));

  const findings = buildKeyFindings(model, 5);
  if (findings.length > 0) blocks.push(['Key Findings', ...findings].join('\n'));

  const evidence = buildEvidence(model, 8);
  if (evidence.length > 0) blocks.push(['Evidence', ...evidence].join('\n'));

  const interpretation = buildInterpretation(model, 4);
  if (interpretation.length > 0) blocks.push(['Interpretation', ...interpretation].join('\n'));

  const monitoring = buildMonitoringPoints(model, 4);
  if (monitoring.length > 0) blocks.push(['Monitoring Points', ...monitoring].join('\n'));

  if (model.staleSyncNote) blocks.push(model.staleSyncNote);

  const confidence = buildConfidenceLine(model);
  if (confidence) blocks.push(confidence);

  return blocks.join('\n\n');
}

function renderChat(model: RenderModel): string {
  const blocks: string[] = [];
  blocks.push(buildSummary(model));

  const details: string[] = [];
  for (const insight of model.insights.slice(0, 2)) {
    const description = insight.description?.trim();
    details.push(description ? firstSentence(endWithPeriod(description)) : endWithPeriod(insight.title));
  }

  if (details.length === 0) {
    const evidence = model.metrics
      .slice(0, 3)
      .map((metric) => `${metric.label} ${metricLine(metric)}`)
      .join(', ');
    if (evidence) details.push(endWithPeriod(`Measured values${periodPhrase(model.period)}: ${evidence}`));
  }

  if (details.length > 0) blocks.push(dedupe(details).join(' '));

  if (model.staleSyncNote) blocks.push(model.staleSyncNote);

  const confidence = buildConfidenceLine(model);
  if (confidence) blocks.push(confidence);

  return blocks.join('\n\n');
}

function renderTelegram(model: RenderModel): string {
  const lines: string[] = ['Radareum · Daily Brief', ''];

  const headline = model.metrics.find((metric) => metric.unit === 'usd') ?? model.metrics[0];
  if (headline) {
    lines.push(`${headline.label}: ${metricLine(headline)}`, '');
  }

  const topInsight = model.insights[0];
  if (topInsight) {
    lines.push(endWithPeriod(topInsight.title), '');
  }

  const secondary = model.insights[1];
  if (secondary) {
    lines.push(endWithPeriod(secondary.title), '');
  }

  if (!headline && !topInsight && model.summaries.length > 0) {
    lines.push(firstSentence(model.summaries[0]), '');
  }

  if (model.staleSyncNote) {
    lines.push('Wallet synchronization is outdated.', '');
  }

  if (model.confidence && model.confidence !== 'high') {
    lines.push(`Confidence: ${model.confidence}.`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders structured intelligence into professional prose without an LLM.
 * Deterministic: identical input always produces identical output.
 */
export function renderDeterministicNarrative(args: RenderNarrativeArgs): string {
  const now = args.now ?? new Date();
  const model = buildRenderModel(args, now);

  if (model.modules.length === 0) return renderInsufficientData(args, now);

  switch (args.mode) {
    case 'telegram':
      return renderTelegram(model);
    case 'chat':
      return renderChat(model);
    default:
      return renderDashboard(model);
  }
}

/**
 * Compact, deterministic serialization of intelligence results for injection
 * into an LLM prompt as retrieved facts (never as instructions).
 */
export function formatIntelligenceFacts(
  intelligence: NarrativeIntelligence | NarrativeIntelligence[] | null | undefined
): string {
  const modules = toModuleArray(intelligence).filter(hasContent);
  if (modules.length === 0) return 'No precomputed intelligence was supplied for this request.';

  const blocks: string[] = [];

  modules.forEach((module, index) => {
    const label = moduleLabel(module, index);
    const lines: string[] = [`MODULE: ${label}${module.period ? ` (period: ${module.period})` : ''}`];

    if (module.summary?.trim()) lines.push(`SUMMARY: ${module.summary.trim()}`);

    const metricLines: string[] = [];
    for (const [key, value] of Object.entries(module.metrics ?? {})) {
      const normalized = normalizeMetric(key, value);
      if (normalized) metricLines.push(`- ${normalized.label}: ${metricLine(normalized)}`);
    }
    if (metricLines.length > 0) lines.push('METRICS:', ...metricLines);

    const headline = evidenceLines(module.evidence);
    if (headline.length > 0) lines.push('EVIDENCE:', ...headline.map((line) => `- ${line}`));

    const patternLines: string[] = [];
    for (const pattern of module.patterns ?? []) {
      if (!pattern || pattern.detected === false) continue;
      const name = patternLabel(pattern);
      if (!name && !pattern.description) continue;
      const severity = pattern.severity ? ` [${pattern.severity}]` : '';
      const description = pattern.description?.trim() ? ` — ${pattern.description.trim()}` : '';
      patternLines.push(`- ${name || 'Pattern'}${severity}${description}`);
    }
    if (patternLines.length > 0) lines.push('PATTERNS:', ...patternLines);

    const insightLines: string[] = [];
    for (const insight of module.insights ?? []) {
      if (!insight?.title?.trim()) continue;
      const severity = insight.severity ? `[${insight.severity}] ` : '';
      const description = insight.description?.trim() ? ` — ${insight.description.trim()}` : '';
      const confidence = toConfidenceLevel(insight.confidence);
      const confidenceText = confidence ? ` (confidence: ${confidence})` : '';
      const evidence = evidenceLines(insight.evidence);
      const evidenceText = evidence.length > 0 ? ` (evidence: ${evidence.join('; ')})` : '';
      insightLines.push(`- ${severity}${insight.title.trim()}${description}${confidenceText}${evidenceText}`);
    }
    if (insightLines.length > 0) lines.push('INSIGHTS:', ...insightLines);

    if (module.monitoringPoints?.length) {
      lines.push('MONITORING POINTS:', ...module.monitoringPoints.map((point) => `- ${point}`));
    }

    const quality = module.dataQuality;
    if (quality) {
      const level =
        toConfidenceLevel(quality.level as ConfidenceLevel | undefined) ??
        toConfidenceLevel(quality.score) ??
        toConfidenceLevel(quality.completeness);
      const reasons = dedupe([
        ...(quality.issues ?? []),
        ...(quality.limitations ?? []),
        ...(quality.missing ?? []).map((item) => `${item} is not available`),
      ]);
      if (level || reasons.length > 0) {
        lines.push(`DATA QUALITY: ${level ?? 'unspecified'}${reasons.length > 0 ? ` — ${reasons.join('; ')}` : ''}`);
      }
    }

    blocks.push(lines.join('\n'));
  });

  return blocks.join('\n\n');
}
