/**
 * CryptoBooks AI Context Builder
 *
 * Builds rich, token-aware user context for the AI agent.
 * Extracts wallet data, transaction summaries, and page-specific context
 * while respecting model token limits.
 *
 * This module runs on both client and server — it should not
 * import any server-only modules.
 */

import { getModelSpec, DEFAULT_MODEL_ID } from './models';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';

// ============================================================
// Types
// ============================================================

export interface WalletContext {
  walletCount: number;
  activeWalletId: string | null;
  activeWalletAddress: string | null;
  activeWalletLabel: string | null;
  transactionCount: number;
  currentPlan: string;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  netFlow: number;
  gasFees: number;
  /** Notional of trade/DeFi/bridge/NFT — excluded from R/E */
  tradingVolume: number;
  topTokens: Array<{ token: string; value: number; count: number }>;
  topNetworks: Array<{ network: string; value: number; count: number }>;
  topCounterparties: Array<{ label: string; value: number; count: number }>;
  dateRange: { from: string; to: string } | null;
  transactionTypeBreakdown: Record<string, number>;
}

export interface PageContext {
  page: string;
  section?: string;
  filters?: Record<string, string>;
  visibleData?: string; // Brief description of what's visible
}

export interface BuiltContext {
  /** The constructed context string for the AI prompt */
  contextString: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** Whether the context was truncated */
  wasTruncated: boolean;
  /** Sections included */
  sections: string[];
}

// ============================================================
// Constants
// ============================================================

/** Maximum context tokens to use for user context (leaves room for system prompt + output) */
const MAX_CONTEXT_TOKENS = 4000;

/** Approximate characters per token for mixed Arabic/English text */
const CHARS_PER_TOKEN = 3;

/** Maximum number of transactions to include in detail */
const MAX_TRANSACTION_DETAIL = 20;

/** Maximum number of items per top-N list */
const MAX_TOP_ITEMS = 5;

// ============================================================
// Token Estimation
// ============================================================

/**
 * Rough token count estimation for mixed Arabic/English text.
 * Arabic text uses more tokens than English per character.
 */
export function estimateTokens(text: string): number {
  // Count Arabic characters (they use more tokens)
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.length;
  const nonArabicChars = totalChars - arabicChars;

  // Arabic: ~2 chars/token, English/mixed: ~4 chars/token
  const estimatedTokens = Math.ceil(arabicChars / 2 + nonArabicChars / 4);
  return estimatedTokens;
}

/**
 * Truncate text to fit within a token budget.
 */
export function truncateToTokenLimit(text: string, maxTokens: number): {
  text: string;
  wasTruncated: boolean;
  tokensUsed: number;
} {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) {
    return { text, wasTruncated: false, tokensUsed: currentTokens };
  }

  // Estimate character limit
  const charLimit = maxTokens * CHARS_PER_TOKEN;
  const truncated = text.slice(0, charLimit);

  // Find the last complete line
  const lastNewline = truncated.lastIndexOf('\n');
  const finalText = lastNewline > charLimit * 0.8
    ? truncated.slice(0, lastNewline)
    : truncated;

  return {
    text: finalText + '\n[... context truncated ...]',
    wasTruncated: true,
    tokensUsed: estimateTokens(finalText),
  };
}

// ============================================================
// Wallet Data Extraction
// ============================================================

/**
 * Extract wallet context from the wallet store's persisted state.
 * This runs on the client side before sending to the API.
 */
export function extractWalletContextFromStorage(): WalletContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem('cryptobooks-wallets');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const state = parsed?.state;
    if (!state) return null;

    const activeWallet = state.activeWalletId
      ? state.wallets?.find((w: { id: string }) => w.id === state.activeWalletId)
      : null;

    const transactionCount = state.activeWalletId
      ? state.transactionsMap?.[state.activeWalletId]?.length || 0
      : 0;

    return {
      walletCount: state.wallets?.length || 0,
      activeWalletId: state.activeWalletId || null,
      activeWalletAddress: activeWallet?.address || null,
      activeWalletLabel: activeWallet?.label || null,
      transactionCount,
      currentPlan: state.currentPlan || 'starter',
    };
  } catch {
    return null;
  }
}

/**
 * Build a transaction summary from raw transaction data.
 * Used both client-side and server-side.
 */
export function buildTransactionSummary(
  transactions: Array<{
    type: string;
    value: number;
    token: string;
    network: string;
    networkAr?: string;
    counterparty: string;
    counterpartyLabel?: string;
    date: string;
  }>,
  clients: Array<{ name: string; address: string }> = [],
): TransactionSummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  let gasFees = 0;
  let tradingVolume = 0;
  const tokenMap: Record<string, { value: number; count: number }> = {};
  const networkMap: Record<string, { value: number; count: number }> = {};
  const counterpartyMap: Record<string, { value: number; count: number }> = {};
  const typeBreakdown: Record<string, number> = {};
  let minDate = '';
  let maxDate = '';

  for (const tx of transactions) {
    const val = tx.value || 0;

    // Type breakdown
    typeBreakdown[tx.type] = (typeBreakdown[tx.type] || 0) + val;

    // Same cash-flow rules as portfolio cards (trades excluded; gas separate)
    if (isRevenueType(tx.type)) {
      totalIncome += val;
    } else if (isExpenseType(tx.type)) {
      totalExpenses += val;
    } else if (tx.type === 'gas') {
      gasFees += val;
    } else if (
      tx.type === 'trade' ||
      tx.type === 'defi' ||
      tx.type === 'bridge' ||
      tx.type === 'nft'
    ) {
      tradingVolume += val;
    }

    // Token aggregation
    if (!tokenMap[tx.token]) tokenMap[tx.token] = { value: 0, count: 0 };
    tokenMap[tx.token].value += val;
    tokenMap[tx.token].count++;

    // Network aggregation
    const networkLabel = tx.networkAr || tx.network;
    if (!networkMap[networkLabel]) networkMap[networkLabel] = { value: 0, count: 0 };
    networkMap[networkLabel].value += val;
    networkMap[networkLabel].count++;

    // Counterparty aggregation — prefer named clients
    const cpLabel = resolveCounterpartyDisplay(
      {
        counterparty: tx.counterparty,
        counterpartyLabel: tx.counterpartyLabel,
      },
      clients,
    );
    if (!counterpartyMap[cpLabel]) counterpartyMap[cpLabel] = { value: 0, count: 0 };
    counterpartyMap[cpLabel].value += val;
    counterpartyMap[cpLabel].count++;

    // Date range
    if (!minDate || tx.date < minDate) minDate = tx.date;
    if (!maxDate || tx.date > maxDate) maxDate = tx.date;
  }

  // Sort and take top items
  const topTokens = Object.entries(tokenMap)
    .sort(([, a], [, b]) => b.value - a.value)
    .slice(0, MAX_TOP_ITEMS)
    .map(([token, data]) => ({ token, ...data }));

  const topNetworks = Object.entries(networkMap)
    .sort(([, a], [, b]) => b.value - a.value)
    .slice(0, MAX_TOP_ITEMS)
    .map(([network, data]) => ({ network, ...data }));

  const topCounterparties = Object.entries(counterpartyMap)
    .sort(([, a], [, b]) => b.value - a.value)
    .slice(0, MAX_TOP_ITEMS)
    .map(([label, data]) => ({ label, ...data }));

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netFlow: Math.round((totalIncome - totalExpenses) * 100) / 100,
    gasFees: Math.round(gasFees * 100) / 100,
    tradingVolume: Math.round(tradingVolume * 100) / 100,
    topTokens,
    topNetworks,
    topCounterparties,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    transactionTypeBreakdown: typeBreakdown,
  };
}

// ============================================================
// Page-Specific Context
// ============================================================

/**
 * Get context description based on the current page.
 * Returns Arabic descriptions that help the AI understand what the user is looking at.
 */
export function getPageContextDescription(page: string, section?: string): PageContext {
  const pageDescriptions: Record<string, { description: string; relevantData: string }> = {
    dashboard: {
      description: 'Main dashboard — portfolio summary, inflow, and outflow',
      relevantData: 'Inflow, outflow, net flow, gas fees, and portfolio value',
    },
    transactions: {
      description: 'Transactions table — all transactions with filters and search',
      relevantData: 'Transaction list filtered by type, token, network, and date',
    },
    assets: {
      description: 'Assets page — token holdings, prices, and changes',
      relevantData: 'Asset list with quantity, price, value, and 24h change',
    },
    clients: {
      description: 'Clients page — transaction counterparties',
      relevantData: 'Client list with labels, notes, and transaction stats',
    },
    reports: {
      description: 'Reports page — financial reports and analysis',
      relevantData: 'Inflow, outflow, flow, and gas fee reports',
    },
    settings: {
      description: 'Settings page — account and subscription',
      relevantData: 'Subscription plan, alerts, and wallets',
    },
    alerts: {
      description: 'Alerts page — Telegram and email alerts',
      relevantData: 'Alert settings for large transfers and portfolio changes',
    },
    pricing: {
      description: 'Pricing page — subscription plans',
      relevantData: 'Starter, Pro, and Enterprise plans',
    },
  };

  const pageInfo = pageDescriptions[page] || pageDescriptions.dashboard;

  return {
    page,
    section,
    visibleData: pageInfo.relevantData,
  };
}

// ============================================================
// Context Builder (Main)
// ============================================================

/**
 * Build the complete user context string for the AI prompt.
 * Token-aware: will truncate if context exceeds model limits.
 *
 * @param options - Context building options
 * @returns Built context with metadata
 */
export function buildUserContext(options: {
  walletContext?: WalletContext | null;
  transactionSummary?: TransactionSummary | null;
  pageContext?: PageContext | null;
  modelId?: string;
  /** Additional custom context to include */
  customContext?: Record<string, unknown>;
  /** Maximum tokens to use for context (overrides model-based calculation) */
  maxTokens?: number;
}): BuiltContext {
  const {
    walletContext,
    transactionSummary,
    pageContext,
    modelId,
    customContext,
    maxTokens,
  } = options;

  const sections: string[] = [];
  const parts: string[] = [];

  // ─── Section 1: User & Plan Context ─────────────────────
  if (walletContext || customContext) {
    const userParts: string[] = [];
    userParts.push('## User context');

    if (walletContext) {
      userParts.push(`- Plan: ${walletContext.currentPlan}`);
      userParts.push(`- Wallet count: ${walletContext.walletCount}`);
      if (walletContext.activeWalletLabel) {
        userParts.push(`- Active wallet: ${walletContext.activeWalletLabel}`);
      }
      if (walletContext.activeWalletAddress) {
        const addr = walletContext.activeWalletAddress;
        userParts.push(`- Wallet address: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
      }
      userParts.push(`- Transaction count: ${walletContext.transactionCount}`);
    }

    if (customContext?.plan) {
      userParts.push(`- Plan: ${customContext.plan}`);
    }

    sections.push('user');
    parts.push(userParts.join('\n'));
  }

  // ─── Section 2: Page Context ────────────────────────────
  if (pageContext) {
    const pageParts: string[] = [];
    pageParts.push('## Current page');
    pageParts.push(`- Page: ${pageContext.page}`);
    if (pageContext.section) {
      pageParts.push(`- Section: ${pageContext.section}`);
    }
    if (pageContext.visibleData) {
      pageParts.push(`- Visible data: ${pageContext.visibleData}`);
    }

    sections.push('page');
    parts.push(pageParts.join('\n'));
  }

  // ─── Section 3: Transaction Summary ─────────────────────
  if (transactionSummary) {
    const txParts: string[] = [];
    txParts.push('## Transaction summary');
    txParts.push(`- Total inflow: $${transactionSummary.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- Total outflow: $${transactionSummary.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- Net flow: $${transactionSummary.netFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- Gas fees: $${transactionSummary.gasFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    if (transactionSummary.tradingVolume > 0) {
      txParts.push(`- Trading volume (excluded from inflow/outflow): $${transactionSummary.tradingVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }
    txParts.push('- Methodology: Inflow = income+staking · Outflow = outgoing transfers · Trades/DeFi/bridge/NFT excluded · Gas separate (not deducted from Net Flow)');

    if (transactionSummary.dateRange) {
      txParts.push(`- Date range: ${transactionSummary.dateRange.from} to ${transactionSummary.dateRange.to}`);
    }

    // Top tokens
    if (transactionSummary.topTokens.length > 0) {
      txParts.push('\n### Top tokens');
      for (const t of transactionSummary.topTokens) {
        txParts.push(`- ${t.token}: $${t.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${t.count} txs)`);
      }
    }

    // Top networks
    if (transactionSummary.topNetworks.length > 0) {
      txParts.push('\n### Top networks');
      for (const n of transactionSummary.topNetworks) {
        txParts.push(`- ${n.network}: $${n.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${n.count} txs)`);
      }
    }

    // Top counterparties
    if (transactionSummary.topCounterparties.length > 0) {
      txParts.push('\n### Top counterparties');
      for (const c of transactionSummary.topCounterparties) {
        txParts.push(`- ${c.label}: $${c.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${c.count} txs)`);
      }
    }

    // Type breakdown
    const typeLabels: Record<string, string> = {
      income: 'Income', expense: 'Expense', trade: 'Trade',
      defi: 'DeFi', staking: 'Staking', gas: 'Gas Fees',
    };
    const typeEntries = Object.entries(transactionSummary.transactionTypeBreakdown);
    if (typeEntries.length > 0) {
      txParts.push('\n### Breakdown by type');
      for (const [type, value] of typeEntries) {
        txParts.push(`- ${typeLabels[type] || type}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      }
    }

    sections.push('transactions');
    parts.push(txParts.join('\n'));
  }

  // ─── Build Final Context ────────────────────────────────
  let contextString = parts.join('\n\n');
  if (sections.length === 0) {
    contextString = '## User context\n- No data available';
  }

  // Token-aware truncation
  const tokenBudget = maxTokens || MAX_CONTEXT_TOKENS;
  const truncationResult = truncateToTokenLimit(contextString, tokenBudget);

  return {
    contextString: truncationResult.text,
    estimatedTokens: truncationResult.tokensUsed,
    wasTruncated: truncationResult.wasTruncated,
    sections,
  };
}

/**
 * Build a quick context for the "quick analysis" feature.
 * This is a minimal context that only includes what's relevant for the current page.
 */
export function buildQuickAnalysisContext(options: {
  page: string;
  section?: string;
  walletContext?: WalletContext | null;
  transactionSummary?: TransactionSummary | null;
}): BuiltContext {
  const pageCtx = getPageContextDescription(options.page, options.section);

  return buildUserContext({
    walletContext: options.walletContext,
    transactionSummary: options.transactionSummary,
    pageContext: pageCtx,
    modelId: DEFAULT_MODEL_ID,
    maxTokens: 2000, // Smaller context for quick analysis
  });
}

/**
 * Sanitize user data to prevent prompt injection.
 * Removes patterns that could manipulate the AI's behavior.
 */
export function sanitizeContextData(data: unknown): string {
  const str = JSON.stringify(data);
  return str
    .replace(/system\s*:/gi, '')
    .replace(/assistant\s*:/gi, '')
    .replace(/\[INST\]/gi, '')
    .replace(/\[\/INST\]/gi, '')
    .replace(/ignore\s+(previous|all|above)\s+instructions/gi, '')
    .replace(/forget\s+(your|all)\s+(rules|instructions)/gi, '');
}
