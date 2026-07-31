/**
 * Pure helpers that mirror on-screen filter-stat cards for PDF/Excel summaries.
 */

import type { ReportKV } from '@/lib/export/download-report';
import { type Transaction, type Client } from '@/lib/mock-data';
import {
  isBlankCounterparty,
  resolveCounterpartyDisplay,
} from '@/lib/clients/display';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';

const EMPTY = '—';

function findMode(values: string[]): { label: string; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  if (!best) return null;
  return { label: best, count: bestCount };
}

function formatHumanDuration(fromDate: string, toDate: string): string {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return EMPTY;

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years >= 1) return years === 1 ? '1 year' : `${years} years`;
  if (months >= 1) return months === 1 ? '1 month' : `${months} months`;
  const dayCount = Math.max(days, 1);
  return dayCount === 1 ? '1 day' : `${dayCount} days`;
}

function counterpartyDisplay(
  tx: Transaction,
  clients: Client[],
): { key: string; label: string } | null {
  if (isBlankCounterparty(tx.counterparty)) return null;
  const key = tx.counterparty.toLowerCase();
  const label = resolveCounterpartyDisplay(
    {
      counterparty: tx.counterparty,
      counterpartyLabel: tx.counterpartyLabel,
    },
    clients,
  );
  return { key, label };
}

function formatUsd(num: number): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsdMoney(num: number): string {
  return `$${formatUsd(num)}`;
}

function txUsdValue(tx: Transaction): number {
  const raw = tx.value;
  if (raw == null || Number.isNaN(raw)) return 0;
  return Math.abs(raw);
}

function modeLabel(mode: { label: string; count: number } | null): string {
  if (!mode) return EMPTY;
  return `${mode.label} (${mode.count}×)`;
}

function dateRangeParts(transactions: Transaction[]): {
  duration: string;
  dateRange: string;
} {
  if (transactions.length === 0) {
    return { duration: EMPTY, dateRange: 'No data' };
  }
  const dates = transactions.map(tx => tx.date).filter(Boolean).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  return {
    duration: formatHumanDuration(minDate, maxDate),
    dateRange: `From ${minDate} to ${maxDate}`,
  };
}

function topCounterparty(
  transactions: Transaction[],
  clients: Client[],
): { label: string; count: number } | null {
  const counterparties = transactions
    .map(tx => counterpartyDisplay(tx, clients))
    .filter((item): item is { key: string; label: string } => item !== null);

  if (counterparties.length === 0) return null;

  const counts = new Map<string, { label: string; count: number }>();
  for (const cp of counterparties) {
    const existing = counts.get(cp.key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(cp.key, { label: cp.label, count: 1 });
    }
  }
  let best: { label: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best;
}

function flowTotals(transactions: Transaction[]) {
  let revenue = 0;
  let expense = 0;
  let volume = 0;
  for (const tx of transactions) {
    const abs = txUsdValue(tx);
    volume += abs;
    if (isRevenueType(tx.type)) revenue += tx.value;
    if (isExpenseType(tx.type)) expense += tx.value;
  }
  return { revenue, expense, netFlow: revenue - expense, volume };
}

/** Asset detail second row: Active Period, Top Method, Top Network, Top Counterparty, Volume. */
export function buildAssetFilterStatsSummary(
  transactions: Transaction[],
  clients: Client[] = [],
): ReportKV[] {
  const { duration, dateRange } = dateRangeParts(transactions);
  const volume = transactions.reduce((sum, tx) => sum + txUsdValue(tx), 0);
  return [
    { label: 'Active Period', value: `${duration} · ${dateRange}` },
    {
      label: 'Top Method',
      value: modeLabel(
        findMode(transactions.map(tx => tx.activity || 'Transfer')),
      ),
    },
    {
      label: 'Top Network',
      value: modeLabel(
        findMode(
          transactions.map(tx => tx.networkLabel || tx.network).filter(Boolean),
        ),
      ),
    },
    {
      label: 'Top Counterparty',
      value: modeLabel(topCounterparty(transactions, clients)),
    },
    {
      label: 'Volume (USD)',
      value:
        transactions.length === 0
          ? EMPTY
          : `${formatUsdMoney(volume)} · ${transactions.length} tx`,
    },
  ];
}

/** Client detail 2×5 filter stats. */
export function buildClientFilterStatsSummary(
  transactions: Transaction[],
): ReportKV[] {
  if (transactions.length === 0) {
    return [
      { label: 'Inflow (USD)', value: EMPTY },
      { label: 'Outflow (USD)', value: EMPTY },
      { label: 'Net Flow (USD)', value: EMPTY },
      { label: 'Volume (USD)', value: EMPTY },
      { label: 'Transactions', value: '0' },
      { label: 'Top Token', value: EMPTY },
      { label: 'Active Period', value: EMPTY },
      { label: 'Top Method', value: EMPTY },
      { label: 'Top Network', value: EMPTY },
      { label: 'Avg Value (USD)', value: EMPTY },
    ];
  }

  const { revenue, expense, netFlow, volume } = flowTotals(transactions);
  const { duration, dateRange } = dateRangeParts(transactions);
  const avgValue = volume / transactions.length;
  const netPrefix = netFlow >= 0 ? '+' : '';

  return [
    { label: 'Inflow (USD)', value: formatUsdMoney(revenue) },
    { label: 'Outflow (USD)', value: formatUsdMoney(expense) },
    { label: 'Net Flow (USD)', value: `${netPrefix}${formatUsdMoney(netFlow)}` },
    { label: 'Volume (USD)', value: formatUsdMoney(volume) },
    { label: 'Transactions', value: String(transactions.length) },
    {
      label: 'Top Token',
      value: modeLabel(findMode(transactions.map(tx => tx.token).filter(Boolean))),
    },
    { label: 'Active Period', value: `${duration} · ${dateRange}` },
    {
      label: 'Top Method',
      value: modeLabel(
        findMode(transactions.map(tx => tx.activity || 'Transfer')),
      ),
    },
    {
      label: 'Top Network',
      value: modeLabel(
        findMode(
          transactions.map(tx => tx.networkLabel || tx.network).filter(Boolean),
        ),
      ),
    },
    { label: 'Avg Value (USD)', value: formatUsdMoney(avgValue) },
  ];
}

/** Network detail 2×5 filter stats (no Top Network). */
export function buildNetworkFilterStatsSummary(
  transactions: Transaction[],
  clients: Client[] = [],
): ReportKV[] {
  if (transactions.length === 0) {
    return [
      { label: 'Inflow (USD)', value: EMPTY },
      { label: 'Outflow (USD)', value: EMPTY },
      { label: 'Net Flow (USD)', value: EMPTY },
      { label: 'Volume (USD)', value: EMPTY },
      { label: 'Transactions', value: '0' },
      { label: 'Top Token', value: EMPTY },
      { label: 'Active Period', value: EMPTY },
      { label: 'Top Method', value: EMPTY },
      { label: 'Top Counterparty', value: EMPTY },
      { label: 'Avg Value (USD)', value: EMPTY },
    ];
  }

  const { revenue, expense, netFlow, volume } = flowTotals(transactions);
  const { duration, dateRange } = dateRangeParts(transactions);
  const avgValue = volume / transactions.length;
  const netPrefix = netFlow >= 0 ? '+' : '';

  return [
    { label: 'Inflow (USD)', value: formatUsdMoney(revenue) },
    { label: 'Outflow (USD)', value: formatUsdMoney(expense) },
    { label: 'Net Flow (USD)', value: `${netPrefix}${formatUsdMoney(netFlow)}` },
    { label: 'Volume (USD)', value: formatUsdMoney(volume) },
    { label: 'Transactions', value: String(transactions.length) },
    {
      label: 'Top Token',
      value: modeLabel(findMode(transactions.map(tx => tx.token).filter(Boolean))),
    },
    { label: 'Active Period', value: `${duration} · ${dateRange}` },
    {
      label: 'Top Method',
      value: modeLabel(
        findMode(transactions.map(tx => tx.activity || 'Transfer')),
      ),
    },
    {
      label: 'Top Counterparty',
      value: modeLabel(topCounterparty(transactions, clients)),
    },
    { label: 'Avg Value (USD)', value: formatUsdMoney(avgValue) },
  ];
}

/** Type detail 2×5 filter stats (no Top Type). */
export function buildTypeFilterStatsSummary(
  transactions: Transaction[],
): ReportKV[] {
  return buildClientFilterStatsSummary(transactions);
}
