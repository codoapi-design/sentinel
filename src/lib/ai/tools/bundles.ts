/**
 * Sentinel AI — Tool Bundles
 *
 * Spec §3.9–§3.10: a broad question must not fan out into a dozen tool calls.
 * A bundle maps a page or section context to the **minimal** tool set that can
 * answer it, so "analyze my wallet" is one plan rather than twelve calls.
 *
 * Every bundle stays within the Part 7 §7.4 limit of four tools per question.
 */

import type { ToolName } from './registry';

export type BundleName = 'dashboard' | 'trading' | 'network' | 'report';

export interface ToolBundle {
  name: BundleName;
  label: string;
  description: string;
  tools: ToolName[];
}

/** The four bundles defined in Spec §3.10. */
export const BUNDLES: Readonly<Record<BundleName, ToolBundle>> = Object.freeze({
  dashboard: {
    name: 'dashboard',
    label: 'Dashboard Bundle',
    description: 'Portfolio, assets, ROI and flows — the standing view of the wallet.',
    tools: [
      'get_portfolio_overview',
      'get_performance_analysis',
      'get_flow_analysis',
      'get_asset_intelligence',
    ],
  },
  trading: {
    name: 'trading',
    label: 'Trading Bundle',
    description: 'Transactions, volume, gas and the networks the activity ran on.',
    tools: ['get_trading_intelligence', 'get_network_intelligence', 'get_flow_analysis'],
  },
  network: {
    name: 'network',
    label: 'Network Bundle',
    description: 'Cross-chain distribution, the flows behind it and the activity that produced it.',
    tools: ['get_network_intelligence', 'get_flow_analysis', 'get_trading_intelligence'],
  },
  report: {
    name: 'report',
    label: 'Report Bundle',
    description: 'Everything, merged into one ranked view.',
    tools: ['generate_intelligence_report'],
  },
});

/**
 * Section keys the product uses today (`sectionType` on the AI Data Analysis
 * button) plus the page names the chat context reports. Unknown keys fall back
 * to the Dashboard Bundle.
 */
const SECTION_TOOLS: Record<string, ToolName[]> = {
  // Cash-flow sections — Revenue / Expenses / Net Flow / Gas
  revenue: ['get_flow_analysis', 'get_counterparty_intelligence', 'get_portfolio_overview'],
  income: ['get_flow_analysis', 'get_counterparty_intelligence', 'get_portfolio_overview'],
  expenses: ['get_flow_analysis', 'get_counterparty_intelligence', 'get_portfolio_overview'],
  flow: ['get_flow_analysis', 'get_performance_analysis', 'get_counterparty_intelligence'],
  cashflow: ['get_flow_analysis', 'get_performance_analysis', 'get_counterparty_intelligence'],
  gas: ['get_network_intelligence', 'get_trading_intelligence'],

  // Dedicated pages
  'trading-volume': BUNDLES.trading.tools,
  trading: BUNDLES.trading.tools,
  'investment-return': ['get_performance_analysis', 'get_flow_analysis'],
  roi: ['get_performance_analysis', 'get_flow_analysis'],
  performance: ['get_performance_analysis', 'get_flow_analysis', 'get_asset_intelligence'],

  // Portfolio surfaces
  portfolio: BUNDLES.dashboard.tools,
  dashboard: BUNDLES.dashboard.tools,
  overview: BUNDLES.dashboard.tools,
  home: BUNDLES.dashboard.tools,

  assets: ['get_asset_intelligence', 'get_portfolio_overview', 'get_performance_analysis'],
  asset: ['get_asset_intelligence', 'get_performance_analysis', 'get_risk_intelligence'],
  holdings: ['get_asset_intelligence', 'get_portfolio_overview', 'get_performance_analysis'],

  networks: BUNDLES.network.tools,
  network: BUNDLES.network.tools,
  chains: BUNDLES.network.tools,

  clients: ['get_counterparty_intelligence', 'get_flow_analysis'],
  client: ['get_counterparty_intelligence', 'get_flow_analysis'],
  counterparty: ['get_counterparty_intelligence', 'get_flow_analysis'],
  counterparties: ['get_counterparty_intelligence', 'get_flow_analysis'],

  transactions: ['get_trading_intelligence', 'get_flow_analysis', 'detect_anomalies'],
  activity: ['get_trading_intelligence', 'get_flow_analysis', 'detect_anomalies'],

  risk: ['get_risk_intelligence', 'get_portfolio_overview'],
  alerts: ['get_wallet_alerts', 'detect_anomalies'],
  anomalies: ['detect_anomalies', 'get_risk_intelligence'],

  report: BUNDLES.report.tools,
  reports: BUNDLES.report.tools,
};

/** Which bundle a section belongs to, for reporting which plan was used. */
const SECTION_BUNDLE: Record<string, BundleName> = {
  'trading-volume': 'trading',
  trading: 'trading',
  gas: 'trading',
  transactions: 'trading',
  activity: 'trading',
  networks: 'network',
  network: 'network',
  chains: 'network',
  report: 'report',
  reports: 'report',
};

function normalizeSection(section?: string | null): string {
  return (section ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export interface SectionPlan {
  /** Normalised section key, or `null` when nothing recognisable was supplied. */
  section: string | null;
  bundle: BundleName;
  tools: ToolName[];
  /** True when the section was recognised rather than defaulted. */
  matched: boolean;
}

/**
 * Resolves a page / section context to its minimal tool set.
 * Unrecognised sections fall back to the Dashboard Bundle.
 */
export function resolveSectionPlan(section?: string | null): SectionPlan {
  const key = normalizeSection(section);
  const tools = key.length > 0 ? SECTION_TOOLS[key] : undefined;

  if (!tools) {
    return {
      section: key.length > 0 ? key : null,
      bundle: 'dashboard',
      tools: [...BUNDLES.dashboard.tools],
      matched: false,
    };
  }

  return {
    section: key,
    bundle: SECTION_BUNDLE[key] ?? 'dashboard',
    tools: [...tools],
    matched: true,
  };
}

export function getBundle(name: BundleName): ToolBundle {
  return BUNDLES[name];
}

/** Every section key the planner recognises — useful for validation and docs. */
export function listSectionKeys(): string[] {
  return Object.keys(SECTION_TOOLS).sort();
}
