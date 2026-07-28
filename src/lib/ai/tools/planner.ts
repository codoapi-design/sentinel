/**
 * Sentinel AI — Deterministic Tool Planner
 *
 * Part 2 §2.8: the planner decides *what* to retrieve; it never retrieves and
 * never computes. This implementation is keyword and context driven — no model
 * call — so the same question always produces the same plan.
 *
 * It answers three questions before any tool runs:
 *
 *   1. Intent      — Part 2 §2.5 taxonomy
 *   2. Analysis mode — Part 4 §4.20 (Snapshot · Trend · Diagnostic ·
 *                      Comparative · Risk · Behavioral · Executive)
 *   3. Tools       — Part 7 §7.4 "use when" rules, capped at four calls
 *
 * Both languages the product ships in are recognised, because the agent must
 * answer in the user's language (Part 7 §7.2 rule 8).
 */

import { resolveSectionPlan, type BundleName } from './bundles';
import type { ToolName } from './registry';

/** Part 4 §4.20 analysis modes. */
export type AnalysisMode =
  | 'snapshot'
  | 'trend'
  | 'diagnostic'
  | 'comparative'
  | 'risk'
  | 'behavioral'
  | 'executive';

/**
 * Part 2 §2.5 intent taxonomy. `risk_analysis` is the one addition: the Spec
 * folds risk questions into Portfolio Analysis, but Risk Intelligence is its
 * own module (§5.5) and its own tool, so it is tracked separately here.
 */
export type IntentCategory =
  | 'portfolio_overview'
  | 'portfolio_analysis'
  | 'transaction_search'
  | 'asset_analysis'
  | 'roi_analysis'
  | 'flow_analysis'
  | 'network_analysis'
  | 'counterparty_analysis'
  | 'trading_analysis'
  | 'performance_analysis'
  | 'risk_analysis'
  | 'timeline_analysis'
  | 'comparison'
  | 'export'
  | 'alert_query'
  | 'wallet_settings'
  | 'general_crypto_knowledge'
  | 'conversation'
  | 'help';

/** Part 7 §7.4 — never more than four tools for a single question. */
export const MAX_TOOLS_PER_QUESTION = 4;

export interface PageContext {
  /** `sectionType` from the AI Data Analysis button, e.g. `trading-volume`. */
  sectionType?: string | null;
  /** Page name when no section was supplied. */
  page?: string | null;
  asset?: string | null;
  network?: string | null;
  counterparty?: string | null;
  period?: string | null;
  /** Symbols the wallet actually holds or traded — makes extraction exact. */
  knownAssets?: readonly string[];
  /** Networks the wallet actually used. */
  knownNetworks?: readonly string[];
}

export interface PlannedEntities {
  asset?: string;
  network?: string;
  counterparty?: string;
}

export interface ToolPlan {
  /** Matched intents, strongest first. */
  intents: IntentCategory[];
  mode: AnalysisMode;
  /** Ordered, de-duplicated, capped at `MAX_TOOLS_PER_QUESTION`. */
  tools: ToolName[];
  /** Bundle the plan started from, when the page context supplied one. */
  bundle: BundleName | null;
  entities: PlannedEntities;
  /** False for greetings, help and general crypto questions. */
  requiresData: boolean;
  /** Plain-language explanation of why these tools were chosen. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

interface IntentRule {
  intent: IntentCategory;
  tools: ToolName[];
  keywords: string[];
  /** Applied to every keyword hit; higher wins ties between intents. */
  weight?: number;
}

/**
 * Keyword sets are intentionally literal. A phrase is matched as a substring
 * of the normalised question, so multi-word triggers stay reliable in both
 * languages without any stemming.
 */
const INTENT_RULES: IntentRule[] = [
  {
    intent: 'portfolio_analysis',
    tools: ['generate_intelligence_report'],
    weight: 2,
    keywords: [
      'analyze my portfolio',
      'analyse my portfolio',
      'analyze my wallet',
      'analyse my wallet',
      'full analysis',
      'full report',
      'complete analysis',
      'overall analysis',
      'everything',
      'حلل محفظتي',
      'تحليل المحفظة',
      'تحليل شامل',
      'تقرير كامل',
    ],
  },
  {
    intent: 'portfolio_overview',
    tools: ['get_portfolio_overview'],
    keywords: [
      'overview',
      'total value',
      'how much do i have',
      'how much is my',
      'my balance',
      'net worth',
      'allocation',
      'composition',
      'holdings',
      'diversification',
      'concentration',
      'portfolio',
      'محفظتي',
      'المحفظة',
      'رصيد',
      'القيمة الإجمالية',
      'التوزيع',
      'التركز',
    ],
  },
  {
    intent: 'performance_analysis',
    tools: ['get_performance_analysis', 'get_flow_analysis'],
    keywords: [
      'performance',
      'how am i doing',
      'profit',
      'loss',
      'gain',
      'return',
      'grew',
      'growth',
      'drawdown',
      'recovery',
      'up or down',
      'أداء',
      'ربح',
      'خسارة',
      'عائد',
      'نمو',
    ],
  },
  {
    intent: 'roi_analysis',
    tools: ['get_performance_analysis', 'get_asset_intelligence'],
    keywords: ['roi', 'pnl', 'p&l', 'realized', 'unrealized', 'cost basis', 'return on investment', 'العائد على الاستثمار', 'الأرباح غير المحققة'],
  },
  {
    intent: 'flow_analysis',
    tools: ['get_flow_analysis', 'get_counterparty_intelligence'],
    keywords: [
      'where did my money go',
      'where does my money',
      'deposit',
      'withdraw',
      'inflow',
      'outflow',
      'cash flow',
      'cashflow',
      'net flow',
      'incoming',
      'outgoing',
      'received',
      'sent',
      'spending',
      'revenue',
      'expenses',
      'تدفق',
      'إيداع',
      'سحب',
      'الوارد',
      'الصادر',
      'أين ذهبت',
      'مصروفات',
      'إيرادات',
    ],
  },
  {
    intent: 'asset_analysis',
    tools: ['get_asset_intelligence', 'get_performance_analysis'],
    keywords: [
      'asset',
      'token',
      'coin',
      'which asset',
      'best performer',
      'worst performer',
      'dormant',
      'أصل',
      'الأصول',
      'العملة',
      'رمز',
    ],
  },
  {
    intent: 'risk_analysis',
    tools: ['get_risk_intelligence', 'get_portfolio_overview'],
    keywords: [
      'risk',
      'safe',
      'safety',
      'exposure',
      'exposed',
      'weakness',
      'vulnerable',
      'too concentrated',
      'مخاطر',
      'خطر',
      'آمنة',
      'الأمان',
      'انكشاف',
    ],
  },
  {
    intent: 'trading_analysis',
    tools: ['get_trading_intelligence', 'get_network_intelligence'],
    keywords: [
      'trading',
      'trade',
      'trades',
      'swap',
      'volume',
      'am i a trader',
      'how often',
      'frequency',
      'turnover',
      'holding time',
      'تداول',
      'صفقات',
      'حجم التداول',
      'مبادلة',
    ],
  },
  {
    intent: 'network_analysis',
    tools: ['get_network_intelligence', 'get_trading_intelligence'],
    keywords: [
      'network',
      'networks',
      'chain',
      'chains',
      'cross-chain',
      'gas',
      'gas fee',
      'fees',
      'l2',
      'layer 2',
      'bridge',
      'شبكة',
      'الشبكات',
      'سلسلة',
      'الغاز',
      'رسوم',
    ],
  },
  {
    intent: 'counterparty_analysis',
    tools: ['get_counterparty_intelligence', 'get_flow_analysis'],
    keywords: [
      'counterparty',
      'counterparties',
      'who did i',
      'who sent',
      'who received',
      'exchange',
      'exchanges',
      'protocol',
      'protocols',
      'client',
      'clients',
      'dex',
      'cex',
      'الطرف',
      'الأطراف',
      'العملاء',
      'منصة',
      'بروتوكول',
    ],
  },
  {
    intent: 'transaction_search',
    tools: ['get_trading_intelligence', 'detect_anomalies'],
    keywords: [
      'transaction',
      'transactions',
      'this tx',
      'explain this',
      'what did i do',
      'recent activity',
      'last transaction',
      'معاملة',
      'المعاملات',
      'العمليات',
      'نشاط',
    ],
  },
  {
    intent: 'alert_query',
    tools: ['get_wallet_alerts', 'detect_anomalies'],
    keywords: [
      'alert',
      'alerts',
      'what changed',
      'what is new',
      "what's new",
      'anything unusual',
      'unusual',
      'anomaly',
      'anomalies',
      'abnormal',
      'did i miss',
      'تنبيه',
      'تنبيهات',
      'ما الجديد',
      'غير معتاد',
      'شاذ',
    ],
  },
  {
    intent: 'timeline_analysis',
    tools: ['get_performance_analysis', 'get_flow_analysis'],
    keywords: [
      'today',
      'yesterday',
      'this week',
      'last week',
      'this month',
      'last month',
      'over time',
      'timeline',
      'history',
      'since',
      'اليوم',
      'الأسبوع',
      'الشهر',
      'التاريخ',
      'عبر الزمن',
    ],
  },
  {
    intent: 'comparison',
    tools: ['get_performance_analysis', 'get_asset_intelligence'],
    keywords: ['compare', 'versus', ' vs ', 'compared to', 'difference between', 'قارن', 'مقارنة', 'الفرق بين'],
  },
  {
    intent: 'export',
    tools: ['generate_intelligence_report'],
    keywords: ['export', 'pdf', 'excel', 'csv', 'download report', 'تصدير', 'تقرير pdf'],
  },
];

const NON_DATA_RULES: Array<{ intent: IntentCategory; keywords: string[] }> = [
  {
    intent: 'help',
    keywords: ['how do i use', 'what can you do', 'help me use', 'how does this work', 'كيف أستخدم', 'ماذا تستطيع'],
  },
  {
    intent: 'general_crypto_knowledge',
    keywords: [
      'what is a ',
      'what is an ',
      'what does it mean',
      'explain what',
      'how does staking work',
      'how does a dex work',
      'ما هو ',
      'ما هي ',
      'ماذا يعني',
    ],
  },
  {
    intent: 'wallet_settings',
    keywords: ['rename', 'settings', 'disconnect', 'add wallet', 'resync', 'sync my wallet', 'إعدادات', 'إعادة المزامنة'],
  },
  {
    intent: 'conversation',
    keywords: ['hello', 'hi ', 'hey', 'thanks', 'thank you', 'good morning', 'مرحبا', 'السلام عليكم', 'شكرا'],
  },
];

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

const MODE_RULES: Array<{ mode: AnalysisMode; keywords: string[] }> = [
  {
    mode: 'comparative',
    keywords: ['compare', 'versus', ' vs ', 'compared to', 'difference between', 'better than', 'قارن', 'مقارنة', 'الفرق بين'],
  },
  {
    mode: 'diagnostic',
    keywords: [
      'why',
      'what caused',
      'reason for',
      'because',
      'what drove',
      'what happened to',
      'where did my money go',
      'where did it go',
      'لماذا',
      'ليش',
      'سبب',
      'ما الذي أدى',
      'أين ذهبت',
    ],
  },
  {
    mode: 'risk',
    keywords: ['risk', 'safe', 'safety', 'exposure', 'exposed', 'weakness', 'concentrated', 'مخاطر', 'خطر', 'آمنة', 'انكشاف'],
  },
  {
    mode: 'behavioral',
    keywords: ['am i a trader', 'behavior', 'behaviour', 'habit', 'pattern', 'how often', 'how do i use', 'سلوك', 'نمط', 'عاداتي'],
  },
  {
    mode: 'executive',
    keywords: ['analyze my portfolio', 'analyse my portfolio', 'full report', 'full analysis', 'complete analysis', 'summary of everything', 'حلل محفظتي', 'تقرير كامل', 'تحليل شامل'],
  },
  {
    mode: 'trend',
    keywords: [
      'trend',
      'over time',
      'history',
      'timeline',
      'since',
      'growth',
      'evolution',
      'this week',
      'this month',
      'what changed',
      "what's new",
      'what is new',
      'اتجاه',
      'تطور',
      'عبر الزمن',
      'ما الجديد',
    ],
  },
];

/** Section → default mode when the user asked nothing (the dashboard button). */
const SECTION_MODES: Record<string, AnalysisMode> = {
  revenue: 'trend',
  income: 'trend',
  expenses: 'trend',
  flow: 'trend',
  cashflow: 'trend',
  gas: 'behavioral',
  'trading-volume': 'behavioral',
  trading: 'behavioral',
  'investment-return': 'trend',
  roi: 'trend',
  performance: 'trend',
  portfolio: 'executive',
  dashboard: 'executive',
  overview: 'snapshot',
  home: 'executive',
  assets: 'snapshot',
  asset: 'diagnostic',
  holdings: 'snapshot',
  networks: 'snapshot',
  network: 'snapshot',
  chains: 'snapshot',
  clients: 'behavioral',
  client: 'behavioral',
  counterparty: 'behavioral',
  counterparties: 'behavioral',
  transactions: 'behavioral',
  activity: 'behavioral',
  risk: 'risk',
  alerts: 'diagnostic',
  anomalies: 'diagnostic',
  report: 'executive',
  reports: 'executive',
};

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/**
 * Maps a question and a page context onto an ordered tool plan.
 *
 * With no question — the "AI Data Analysis" button — the page context alone
 * decides the plan, which is exactly the bundle behaviour of Spec §3.10.
 */
export function planTools(question?: string | null, pageContext?: PageContext): ToolPlan {
  const context = pageContext ?? {};
  const section = context.sectionType ?? context.page ?? null;
  const sectionPlan = resolveSectionPlan(section);
  const text = normalize(question);

  const entities = extractEntities(text, context);
  const focusTools = entityTools(entities);

  if (text.length === 0) {
    const tools = capTools([...focusTools, ...sectionPlan.tools]);
    return {
      intents: [sectionIntent(sectionPlan.section)],
      mode: sectionPlan.section ? SECTION_MODES[sectionPlan.section] ?? 'snapshot' : 'executive',
      tools,
      bundle: sectionPlan.bundle,
      entities,
      requiresData: true,
      reason: sectionPlan.matched
        ? `No question was asked; planned from the ${sectionPlan.section} section (${sectionPlan.bundle} bundle).`
        : 'No question was asked and no known section was supplied; planned from the dashboard bundle.',
    };
  }

  const nonData = matchNonDataIntent(text);
  if (nonData) {
    return {
      intents: [nonData],
      mode: 'snapshot',
      // Grounded even for small talk: the answer stays tied to real wallet data.
      tools: ['get_portfolio_overview'],
      bundle: null,
      entities,
      requiresData: false,
      reason: `The message was classified as ${nonData.replace(/_/g, ' ')}; only a grounding overview is retrieved.`,
    };
  }

  const scored = INTENT_RULES.map(rule => ({ rule, score: scoreRule(rule, text) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const mode = detectMode(text, scored.map(entry => entry.rule.intent));

  if (scored.length === 0) {
    const tools = capTools([...focusTools, ...sectionPlan.tools]);
    return {
      intents: [sectionIntent(sectionPlan.section)],
      mode,
      tools,
      bundle: sectionPlan.bundle,
      entities,
      requiresData: true,
      reason: sectionPlan.matched
        ? `No intent keyword matched; planned from the ${sectionPlan.section} section context.`
        : 'No intent keyword matched; planned from the dashboard bundle.',
    };
  }

  const intents = dedupeIntents(scored.map(entry => entry.rule.intent));
  const planned = capTools([...focusTools, ...scored.flatMap(entry => entry.rule.tools)]);

  // A diagnostic question always needs the capital side of the story, so price
  // movement and deposits are never conflated (Part 7 §7.4 rule 5).
  const tools =
    mode === 'diagnostic' && !planned.includes('get_flow_analysis')
      ? capTools([...planned.slice(0, MAX_TOOLS_PER_QUESTION - 1), 'get_flow_analysis'])
      : planned;

  return {
    intents,
    mode,
    tools,
    bundle: sectionPlan.matched ? sectionPlan.bundle : null,
    entities,
    requiresData: true,
    reason: `Matched ${intents.map(intent => intent.replace(/_/g, ' ')).join(', ')}; answering in ${mode} mode.`,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function normalize(question?: string | null): string {
  if (typeof question !== 'string') return '';
  const collapsed = question.toLowerCase().replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '';
  // Padded so edge keywords such as ` vs ` still match at the boundaries.
  return ` ${collapsed} `;
}

function scoreRule(rule: IntentRule, text: string): number {
  const weight = rule.weight ?? 1;
  let score = 0;
  for (const keyword of rule.keywords) {
    if (text.includes(keyword)) score += weight;
  }
  return score;
}

function matchNonDataIntent(text: string): IntentCategory | null {
  // Only classify as non-data when nothing analytical was asked as well.
  const analytical = INTENT_RULES.some(rule => scoreRule(rule, text) > 0);
  if (analytical) return null;

  for (const rule of NON_DATA_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) return rule.intent;
  }
  return null;
}

function detectMode(text: string, intents: IntentCategory[]): AnalysisMode {
  for (const rule of MODE_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword))) return rule.mode;
  }
  if (intents.includes('portfolio_analysis')) return 'executive';
  if (intents.includes('risk_analysis')) return 'risk';
  if (intents.includes('trading_analysis')) return 'behavioral';
  if (intents.includes('timeline_analysis')) return 'trend';
  // Performance and ROI are questions about change, so they read as a trend
  // even when the user did not name a period.
  if (intents.includes('performance_analysis') || intents.includes('roi_analysis')) return 'trend';
  return 'snapshot';
}

function extractEntities(text: string, context: PageContext): PlannedEntities {
  const entities: PlannedEntities = {};

  const contextAsset = trimOrNull(context.asset);
  const contextNetwork = trimOrNull(context.network);
  const contextCounterparty = trimOrNull(context.counterparty);

  if (contextAsset) entities.asset = contextAsset;
  if (contextNetwork) entities.network = contextNetwork;
  if (contextCounterparty) entities.counterparty = contextCounterparty;

  if (text.length === 0) return entities;

  if (!entities.asset) {
    const asset = findMention(text, context.knownAssets);
    if (asset) entities.asset = asset;
  }
  if (!entities.network) {
    const network = findMention(text, context.knownNetworks);
    if (network) entities.network = network;
  }

  return entities;
}

/**
 * Finds the first candidate mentioned as a whole word. Candidates come from the
 * wallet's own data, so a symbol is never guessed from an arbitrary token.
 */
function findMention(text: string, candidates?: readonly string[]): string | undefined {
  if (!candidates?.length) return undefined;

  for (const candidate of candidates) {
    const key = candidate.trim().toLowerCase();
    if (key.length < 2) continue;
    const index = text.indexOf(key);
    if (index === -1) continue;

    const before = text[index - 1] ?? ' ';
    const after = text[index + key.length] ?? ' ';
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;

    return candidate;
  }
  return undefined;
}

function entityTools(entities: PlannedEntities): ToolName[] {
  const tools: ToolName[] = [];
  if (entities.asset) tools.push('get_asset_intelligence');
  if (entities.network) tools.push('get_network_intelligence');
  if (entities.counterparty) tools.push('get_counterparty_intelligence');
  return tools;
}

function sectionIntent(section: string | null): IntentCategory {
  switch (section) {
    case 'revenue':
    case 'income':
    case 'expenses':
    case 'flow':
    case 'cashflow':
      return 'flow_analysis';
    case 'gas':
    case 'networks':
    case 'network':
    case 'chains':
      return 'network_analysis';
    case 'trading-volume':
    case 'trading':
    case 'transactions':
    case 'activity':
      return 'trading_analysis';
    case 'investment-return':
    case 'roi':
      return 'roi_analysis';
    case 'performance':
      return 'performance_analysis';
    case 'assets':
    case 'asset':
    case 'holdings':
      return 'asset_analysis';
    case 'clients':
    case 'client':
    case 'counterparty':
    case 'counterparties':
      return 'counterparty_analysis';
    case 'alerts':
    case 'anomalies':
      return 'alert_query';
    case 'risk':
      return 'risk_analysis';
    case 'report':
    case 'reports':
      return 'portfolio_analysis';
    default:
      return 'portfolio_overview';
  }
}

function capTools(tools: ToolName[]): ToolName[] {
  return [...new Set(tools)].slice(0, MAX_TOOLS_PER_QUESTION);
}

function dedupeIntents(intents: IntentCategory[]): IntentCategory[] {
  return [...new Set(intents)];
}

function trimOrNull(value?: string | null): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
