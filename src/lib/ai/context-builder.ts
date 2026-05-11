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
    text: finalText + '\n[... تم قطع السياق لتوفير المساحة ...]',
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
  }>
): TransactionSummary {
  let totalIncome = 0;
  let totalExpenses = 0;
  let gasFees = 0;
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

    // Income/expense/gas split
    if (tx.type === 'income' || tx.type === 'staking') {
      totalIncome += val;
    } else if (tx.type === 'gas') {
      gasFees += val;
      totalExpenses += val;
    } else if (tx.type === 'expense') {
      totalExpenses += val;
    } else if (tx.type === 'trade' || tx.type === 'defi') {
      // Split trades/DeFi — count half as income, half as expense
      totalIncome += val * 0.5;
      totalExpenses += val * 0.5;
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

    // Counterparty aggregation
    const cpLabel = tx.counterpartyLabel || tx.counterparty;
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
      description: 'لوحة التحكم الرئيسية — تعرض ملخص المحفظة والإيرادات والمصروفات',
      relevantData: 'ملخص الإيرادات والمصروفات والتدفق الصافي ورسوم الغاز وقيمة المحفظة',
    },
    transactions: {
      description: 'جدول المعاملات — يعرض جميع المعاملات مع تصفية وبحث',
      relevantData: 'قائمة المعاملات مع التصفية حسب النوع والتوكن والشبكة والتاريخ',
    },
    assets: {
      description: 'صفحة الأصول — تعرض محفظة التوكنات والأسعار والتغيرات',
      relevantData: 'قائمة الأصول مع الكمية والسعر والقيمة والتغير اليومي',
    },
    clients: {
      description: 'صفحة العملاء — تعرض الأطراف المقابلة في المعاملات',
      relevantData: 'قائمة العملاء مع أسماء مخصصة وملاحظات وإحصائيات المعاملات',
    },
    reports: {
      description: 'صفحة التقارير — تقارير مالية وتحليلات',
      relevantData: 'تقارير الإيرادات والمصروفات والتدفق ورسوم الغاز',
    },
    tax: {
      description: 'صفحة الضرائب — حسابات الأرباح والخسائر الرأسمالية',
      relevantData: 'حسابات الضريبة والأرباح الرأسمالية والتكلفة الأساسية',
    },
    settings: {
      description: 'صفحة الإعدادات — إعدادات الحساب والاشتراك',
      relevantData: 'خطة الاشتراك وإعدادات التنبيهات والمحافظ',
    },
    alerts: {
      description: 'صفحة التنبيهات — تنبيهات التيليجرام والبريد',
      relevantData: 'إعدادات التنبيهات للتحويلات الكبيرة وتغيرات المحفظة',
    },
    pricing: {
      description: 'صفحة الأسعار — خطط الاشتراك',
      relevantData: 'خطط Starter و Pro و Enterprise',
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
    userParts.push('## سياق المستخدم');

    if (walletContext) {
      userParts.push(`- الباقة: ${walletContext.currentPlan}`);
      userParts.push(`- عدد المحافظ: ${walletContext.walletCount}`);
      if (walletContext.activeWalletLabel) {
        userParts.push(`- المحفظة النشطة: ${walletContext.activeWalletLabel}`);
      }
      if (walletContext.activeWalletAddress) {
        const addr = walletContext.activeWalletAddress;
        userParts.push(`- عنوان المحفظة: ${addr.slice(0, 6)}...${addr.slice(-4)}`);
      }
      userParts.push(`- عدد المعاملات: ${walletContext.transactionCount}`);
    }

    if (customContext?.plan) {
      userParts.push(`- الباقة: ${customContext.plan}`);
    }

    sections.push('user');
    parts.push(userParts.join('\n'));
  }

  // ─── Section 2: Page Context ────────────────────────────
  if (pageContext) {
    const pageParts: string[] = [];
    pageParts.push('## الصفحة الحالية');
    pageParts.push(`- الصفحة: ${pageContext.page}`);
    if (pageContext.section) {
      pageParts.push(`- القسم: ${pageContext.section}`);
    }
    if (pageContext.visibleData) {
      pageParts.push(`- البيانات المرئية: ${pageContext.visibleData}`);
    }

    sections.push('page');
    parts.push(pageParts.join('\n'));
  }

  // ─── Section 3: Transaction Summary ─────────────────────
  if (transactionSummary) {
    const txParts: string[] = [];
    txParts.push('## ملخص المعاملات المالية');
    txParts.push(`- إجمالي الإيرادات: $${transactionSummary.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- إجمالي المصروفات: $${transactionSummary.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- التدفق الصافي: $${transactionSummary.netFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    txParts.push(`- رسوم الغاز: $${transactionSummary.gasFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    if (transactionSummary.dateRange) {
      txParts.push(`- فترة البيانات: ${transactionSummary.dateRange.from} إلى ${transactionSummary.dateRange.to}`);
    }

    // Top tokens
    if (transactionSummary.topTokens.length > 0) {
      txParts.push('\n### أعلى التوكنات');
      for (const t of transactionSummary.topTokens) {
        txParts.push(`- ${t.token}: $${t.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${t.count} معاملة)`);
      }
    }

    // Top networks
    if (transactionSummary.topNetworks.length > 0) {
      txParts.push('\n### أعلى الشبكات');
      for (const n of transactionSummary.topNetworks) {
        txParts.push(`- ${n.network}: $${n.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${n.count} معاملة)`);
      }
    }

    // Top counterparties
    if (transactionSummary.topCounterparties.length > 0) {
      txParts.push('\n### أعلى الأطراف المقابلة');
      for (const c of transactionSummary.topCounterparties) {
        txParts.push(`- ${c.label}: $${c.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${c.count} معاملة)`);
      }
    }

    // Type breakdown
    const typeLabels: Record<string, string> = {
      income: 'إيراد', expense: 'مصروف', trade: 'تداول',
      defi: 'DeFi', staking: 'Staking', gas: 'رسوم غاز',
    };
    const typeEntries = Object.entries(transactionSummary.transactionTypeBreakdown);
    if (typeEntries.length > 0) {
      txParts.push('\n### توزيع حسب النوع');
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
    contextString = '## سياق المستخدم\n- لا توجد بيانات متاحة حالياً';
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
