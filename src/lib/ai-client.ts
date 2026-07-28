/**
 * Browser-side contract for the Sentinel AI endpoints.
 *
 * Mirrors the response shapes of `POST /api/ai/analyze` and `POST /api/ai/chat`
 * without importing from `src/lib/ai/**`, which is server-only. Also holds the
 * presentation helpers both AI surfaces share: narrative segmentation, metric
 * formatting, and the severity / confidence palettes.
 */

export type AiConfidence = 'high' | 'medium' | 'low';

export type AiSeverity = 'informational' | 'low' | 'medium' | 'high' | 'critical';

export type AiMetricUnit = 'usd' | 'pct' | 'count' | 'days' | 'score' | 'ratio' | 'text';

/** `'deterministic'` is a first-class result, not a degraded one. */
export type AiNarrativeSource = 'llm' | 'deterministic';

export interface AiMetric {
  engine: string;
  key: string;
  label: string;
  value: number | string | boolean;
  unit: AiMetricUnit;
}

export interface AiInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: AiSeverity;
  confidence: AiConfidence;
  category: string | null;
  evidence: Record<string, string | number>;
  impact: string | null;
  impactUsd: number | null;
  relatedEntities: string[];
}

export interface AiDataQuality {
  transactionCount: number;
  pricedCount: number;
  unpricedCount: number;
  /** 0–100 share of rows that carried a usable USD amount. */
  completeness: number;
  truncated: boolean;
  transactionCap: number;
  loadedTransactionCount: number;
  totalTransactionCount: number | null;
  syncStatus: string | null;
  lastSyncedAt: string | null;
  notes: string[];
}

export interface AiAnalysisData {
  narrative: string;
  source: AiNarrativeSource;
  insights: AiInsight[];
  metrics: AiMetric[];
  confidence: AiConfidence;
  dataQuality: AiDataQuality;
  toolsUsed: string[];
  analysisMode: string;
  periodDays: number;
  periodLabel: string;
  generatedAt: number;
}

export interface AiChatData extends AiAnalysisData {
  message: string;
  intents?: string[];
}

/** Page / section the request came from — forwarded verbatim to the runtime. */
export interface AiPageContext {
  sectionType?: string;
  sectionTitle?: string;
  page?: string;
  asset?: string;
  network?: string;
  counterparty?: string;
  typeId?: string;
  period?: string | number;
  filters?: Record<string, string | number | boolean | null>;
}

export interface AiAnalyzeRequest extends AiPageContext {
  walletId: string;
  includeHidden?: boolean;
}

export interface AiChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  walletId: string;
  message: string;
  history?: AiChatHistoryMessage[];
  pageContext?: AiPageContext;
  mode?: 'chat' | 'dashboard';
  includeHidden?: boolean;
}

/** Carries the HTTP status so callers can branch on 401 / 404 without parsing text. */
export class AiRequestError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'AiRequestError';
    this.status = status;
    this.details = details;
  }
}

async function postAi<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new AiRequestError('Could not reach the analysis service. Check your connection.', 0);
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string; details?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new AiRequestError(
      payload?.error || `Request failed (${response.status})`,
      response.status,
      payload?.details
    );
  }

  return payload.data;
}

export function requestAnalysis(body: AiAnalyzeRequest, signal?: AbortSignal): Promise<AiAnalysisData> {
  return postAi<AiAnalysisData>('/api/ai/analyze', body, signal);
}

export function requestChat(body: AiChatRequest, signal?: AbortSignal): Promise<AiChatData> {
  return postAi<AiChatData>('/api/ai/chat', body, signal);
}

// ---------------------------------------------------------------------------
// Page context
// ---------------------------------------------------------------------------

/** Tab id → section key the tool planner recognises. */
const TAB_SECTIONS: Record<string, string> = {
  dashboard: 'dashboard',
  transactions: 'transactions',
  assets: 'assets',
  clients: 'clients',
  networks: 'networks',
  types: 'transactions',
};

/** The navigation state both dashboards keep, narrowed to what the agent needs. */
export interface DashboardView {
  activeTab: string;
  activeSection: string | null;
  activeAsset: string | null;
  activeClient: string | null;
  activeNetwork: string | null;
  activeType: string | null;
  investmentReturnAsset: { symbol: string; network: string } | null;
}

/** Maps dashboard navigation state to the context the chat sends with each turn. */
export function resolveDashboardChatContext(view: DashboardView): AiPageContext {
  if (view.activeSection === 'investment-return-asset' && view.investmentReturnAsset) {
    return {
      page: 'investment-return',
      sectionType: 'investment-return',
      asset: view.investmentReturnAsset.symbol,
      network: view.investmentReturnAsset.network,
    };
  }
  if (view.activeNetwork) {
    return { page: 'network-detail', sectionType: 'network', network: view.activeNetwork };
  }
  if (view.activeType) {
    return { page: 'type-detail', sectionType: 'transactions', typeId: view.activeType };
  }
  if (view.activeClient) {
    return { page: 'client-detail', sectionType: 'counterparty', counterparty: view.activeClient };
  }
  if (view.activeAsset) {
    return { page: 'asset-detail', sectionType: 'asset', asset: view.activeAsset };
  }
  if (view.activeSection) {
    return { page: view.activeSection, sectionType: view.activeSection };
  }
  return { page: view.activeTab, sectionType: TAB_SECTIONS[view.activeTab] };
}

// ---------------------------------------------------------------------------
// Error presentation
// ---------------------------------------------------------------------------

export type AiErrorKind = 'auth' | 'wallet' | 'input' | 'failure';

export interface AiErrorPresentation {
  kind: AiErrorKind;
  title: string;
  message: string;
  retryable: boolean;
}

/** One wording for both AI surfaces, so an expired session reads the same everywhere. */
export function describeAiError(error: unknown): AiErrorPresentation {
  const status = error instanceof AiRequestError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const details = error instanceof AiRequestError ? error.details : undefined;

  if (status === 401) {
    return {
      kind: 'auth',
      title: 'Sign in to continue',
      message: 'Your session has expired. Sign in again to run analysis on your wallet data.',
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      kind: 'wallet',
      title: 'Wallet not found',
      message: 'This wallet is no longer available on your account. Switch wallets and try again.',
      retryable: false,
    };
  }

  if (status === 400) {
    return { kind: 'input', title: 'Request could not be processed', message, retryable: false };
  }

  return {
    kind: 'failure',
    title: 'Analysis failed',
    message: details ? `${message} — ${details}` : message,
    retryable: true,
  };
}

// ---------------------------------------------------------------------------
// Narrative segmentation
// ---------------------------------------------------------------------------

/** Response structure both the LLM and the deterministic renderer emit. */
const SECTION_TITLES = ['Summary', 'Key Findings', 'Evidence', 'Interpretation', 'Monitoring Points'] as const;

export type AiNarrativeSectionTitle = (typeof SECTION_TITLES)[number];

export interface AiNarrativeSection {
  title: AiNarrativeSectionTitle;
  /** Plain paragraphs, in order. */
  paragraphs: string[];
  /** Leading `- ` / `• ` items, in order. */
  bullets: string[];
}

export interface AiNarrative {
  sections: AiNarrativeSection[];
  /** Trailing "Confidence: …" line, lifted out so it renders as an indicator. */
  confidenceNote: string | null;
}

const HEADING_LOOKUP = new Map<string, AiNarrativeSectionTitle>(
  SECTION_TITLES.map(title => [title.toLowerCase(), title])
);

function normalizeHeading(line: string): AiNarrativeSectionTitle | null {
  const cleaned = line
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/[:：]\s*$/, '')
    .trim();

  if (cleaned.length === 0 || cleaned.length > 40) return null;
  return HEADING_LOOKUP.get(cleaned.toLowerCase()) ?? null;
}

const BULLET_PREFIX = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Splits a narrative into its canonical sections. Text that appears before any
 * heading — the whole body in chat mode — becomes the Summary.
 */
export function segmentNarrative(narrative: string): AiNarrative {
  const sections: AiNarrativeSection[] = [];
  let current: AiNarrativeSection | null = null;
  let confidenceNote: string | null = null;

  const ensureCurrent = (): AiNarrativeSection => {
    const existing = current;
    if (existing) return existing;
    const created: AiNarrativeSection = { title: 'Summary', paragraphs: [], bullets: [] };
    current = created;
    sections.push(created);
    return created;
  };

  for (const rawLine of narrative.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) continue;

    const heading = normalizeHeading(line);
    if (heading) {
      const existing = sections.find(section => section.title === heading);
      if (existing) {
        current = existing;
      } else {
        const created: AiNarrativeSection = { title: heading, paragraphs: [], bullets: [] };
        sections.push(created);
        current = created;
      }
      continue;
    }

    if (/^confidence\s*[:—-]/i.test(line.trim())) {
      confidenceNote = line.trim();
      continue;
    }

    const section = ensureCurrent();
    if (BULLET_PREFIX.test(line)) {
      section.bullets.push(line.replace(BULLET_PREFIX, '').trim());
    } else {
      section.paragraphs.push(line.trim());
    }
  }

  return {
    sections: sections.filter(section => section.paragraphs.length > 0 || section.bullets.length > 0),
    confidenceNote,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const USD = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatMetricValue(value: number | string | boolean, unit: AiMetricUnit): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';

  switch (unit) {
    case 'usd': {
      const abs = Math.abs(value);
      const sign = value < 0 ? '−' : '';
      if (abs >= 1_000_000) return `${sign}$${DECIMAL.format(abs / 1_000_000)}M`;
      if (abs >= 10_000) return `${sign}$${WHOLE.format(abs)}`;
      return `${sign}$${USD.format(abs)}`;
    }
    case 'pct':
      return `${DECIMAL.format(value)}%`;
    case 'days':
      return `${WHOLE.format(value)}d`;
    case 'count':
      return WHOLE.format(value);
    case 'score':
    case 'ratio':
    default:
      return DECIMAL.format(value);
  }
}

export function formatEvidenceValue(value: string | number): string {
  if (typeof value === 'number') return Number.isInteger(value) ? WHOLE.format(value) : DECIMAL.format(value);
  return value;
}

export const SEVERITY_LABELS: Record<AiSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Info',
};

/** Severity is magnitude, never a recommendation — the palette stays neutral at the low end. */
export const SEVERITY_STYLES: Record<AiSeverity, string> = {
  critical: 'bg-[#f6465d]/12 text-[#f6465d] border-[#f6465d]/25',
  high: 'bg-[#f7931a]/12 text-[#f7931a] border-[#f7931a]/25',
  medium: 'bg-[#0052ff]/12 text-[#5b8cff] border-[#0052ff]/25',
  low: 'bg-white/5 text-[#8a8f98] border-white/10',
  informational: 'bg-white/5 text-[#8a8f98] border-white/10',
};

export const CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export const CONFIDENCE_COLORS: Record<AiConfidence, string> = {
  high: '#0ecb81',
  medium: '#f7931a',
  low: '#8a8f98',
};

export function formatGeneratedAt(generatedAt: number): string {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function humanizeToolName(tool: string): string {
  return tool
    .replace(/^(get|generate|analyze)_/, '')
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Best-effort clipboard write with a legacy fallback for non-secure contexts. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textArea);
      return ok;
    } catch {
      return false;
    }
  }
}
