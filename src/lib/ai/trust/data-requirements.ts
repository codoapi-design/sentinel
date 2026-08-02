/**
 * Provisional data-requirements plan — decides what to load before DB work.
 */

import type { IntentCategory, ToolPlan } from '@/lib/ai/tools/planner';
import type { ToolName } from '@/lib/ai/tools/registry';

import { periodBounds, SYNC_TRANSACTION_ROW_BUDGET } from './scope';
import type { DataRequirementsPlan } from './types';

export interface DataRequirementsInput {
  plan: ToolPlan;
  question?: string | null;
  periodDays: number;
  now: number;
  entity?: {
    asset?: string | null;
    network?: string | null;
    counterparty?: string | null;
  };
}

const HOLDINGS_TOOLS = new Set<ToolName>([
  'get_portfolio_overview',
  'get_asset_intelligence',
  'get_risk_intelligence',
  'generate_intelligence_report',
]);

const FLOW_TOOLS = new Set<ToolName>([
  'get_flow_analysis',
  'get_counterparty_intelligence',
  'get_network_intelligence',
  'get_trading_intelligence',
  'get_performance_analysis',
  'generate_intelligence_report',
]);

const SNAPSHOT_TOOLS = new Set<ToolName>([
  'get_performance_analysis',
  'get_portfolio_overview',
  'generate_intelligence_report',
]);

/**
 * Holdings-only questions (allocation share, net worth) must not pull
 * transaction history.
 */
export function isHoldingsOnlyQuestion(question: string, intents: IntentCategory[]): boolean {
  const q = question.trim().toLowerCase();
  if (!q) return false;

  const holdingsPhrases = [
    'how much of my portfolio',
    'what percent',
    'what percentage',
    'allocation',
    'composition',
    'net worth',
    'how much do i have',
    'portfolio value',
    'كم من محفظتي',
    'نسبة',
  ];

  const needsFlow =
    intents.includes('flow_analysis') ||
    intents.includes('counterparty_analysis') ||
    intents.includes('trading_analysis') ||
    intents.includes('transaction_search') ||
    intents.includes('timeline_analysis');

  if (needsFlow) return false;
  return holdingsPhrases.some(p => q.includes(p));
}

export function buildDataRequirementsPlan(input: DataRequirementsInput): DataRequirementsPlan {
  const tools = new Set(input.plan.tools);
  const intents = input.plan.intents;
  const question = (input.question ?? '').trim();
  const bounds = periodBounds(input.periodDays, input.now);

  const holdings =
    input.plan.requiresData === false
      ? false
      : [...tools].some(t => HOLDINGS_TOOLS.has(t)) ||
        intents.includes('portfolio_overview') ||
        intents.includes('asset_analysis') ||
        intents.includes('risk_analysis') ||
        isHoldingsOnlyQuestion(question, intents);

  const needsTxRows =
    input.plan.requiresData !== false &&
    !isHoldingsOnlyQuestion(question, intents) &&
    [...tools].some(t => FLOW_TOOLS.has(t));

  const wantsFullHistory =
    needsTxRows &&
    (intents.includes('portfolio_analysis') ||
      intents.includes('flow_analysis') ||
      /full\s*history|all\s*time|entire\s*history|كل\s*التاريخ|التاريخ\s*الكامل/i.test(question));

  let transactions: DataRequirementsPlan['transactions'];

  if (!needsTxRows) {
    transactions = { mode: 'none' };
  } else if (wantsFullHistory && !input.entity?.asset && !input.entity?.network && !input.entity?.counterparty) {
    // Prefer aggregate for totals; engines needing rows use chunked/async path.
    transactions = {
      mode: 'aggregate',
      metrics: ['tx_count', 'inflow_usd', 'outflow_usd', 'net_flow_usd', 'gas_fees_usd', 'trading_volume_usd'],
      from: bounds.from,
      to: bounds.to,
    };
  } else if (input.entity?.asset || input.entity?.network || input.entity?.counterparty) {
    transactions = {
      mode: 'filtered',
      asset: input.entity.asset ?? undefined,
      network: input.entity.network ?? undefined,
      counterparty: input.entity.counterparty ?? undefined,
      from: bounds.from,
      to: bounds.to,
      maxRows: SYNC_TRANSACTION_ROW_BUDGET,
    };
  } else {
    transactions = {
      mode: 'filtered',
      from: bounds.from,
      to: bounds.to,
      maxRows: SYNC_TRANSACTION_ROW_BUDGET,
    };
  }

  // When executive/full report needs row-level engines beyond aggregates, mark chunked.
  if (
    transactions.mode === 'aggregate' &&
    (tools.has('generate_intelligence_report') || tools.has('get_counterparty_intelligence'))
  ) {
    transactions = {
      mode: 'full_entitled_history',
      processing: 'chunked',
    };
  }

  return {
    holdings,
    transactions,
    snapshots: [...tools].some(t => SNAPSHOT_TOOLS.has(t)),
    clients: needsTxRows || tools.has('get_counterparty_intelligence'),
    pricing: holdings,
    investmentReturn:
      tools.has('get_performance_analysis') ||
      tools.has('generate_intelligence_report') ||
      intents.includes('roi_analysis'),
    tradingVolume: tools.has('get_trading_intelligence') || tools.has('generate_intelligence_report'),
  };
}
