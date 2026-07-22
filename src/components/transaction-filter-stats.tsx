'use client';

import { useMemo, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowUpDown,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarRange,
  Activity,
  Globe,
  Users,
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
} from 'lucide-react';
import {
  type Transaction,
  type Client,
  getClientNameByAddress,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { truncateAddress } from '@/lib/wallet/address-validation';
import { cn } from '@/lib/utils';

interface TransactionFilterStatsProps {
  transactions: Transaction[];
  clients?: Client[];
}

interface ModeResult {
  label: string;
  count: number;
}

const EMPTY = '—';

const cardClass = 'bg-[#0f1011] border-white/5 min-h-[56px] min-w-0';
const padClass = 'p-1.5 sm:p-2.5';
const labelClass = 'text-[9px] sm:text-[10px] text-[#8a8f98] truncate';
const valueClass = 'text-xs sm:text-sm font-semibold text-[#f7f8f8] leading-tight truncate';

function isBlankCounterparty(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === '-' ||
    lower === '—' ||
    lower === 'null' ||
    lower === 'none'
  );
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

function findMode(values: string[]): ModeResult | null {
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

function counterpartyDisplay(
  tx: Transaction,
  clients: Client[]
): { key: string; label: string } | null {
  if (isBlankCounterparty(tx.counterparty)) return null;
  const key = tx.counterparty.toLowerCase();
  const clientName = getClientNameByAddress(tx.counterparty, clients);
  const label =
    clientName ||
    (!isBlankCounterparty(tx.counterpartyLabel) ? tx.counterpartyLabel : null) ||
    truncateAddress(tx.counterparty);
  return { key, label };
}

function formatUsd(num: number): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function txUsdValue(tx: Transaction): number {
  const raw = tx.value;
  if (raw == null || Number.isNaN(raw)) return 0;
  return Math.abs(raw);
}

function StatCard({
  icon,
  label,
  children,
  glow,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  glow?: string;
}) {
  return (
    <Card className={cn(cardClass, glow && 'relative overflow-hidden')}>
      {glow && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top right, ${glow} 0%, transparent 70%)`,
          }}
        />
      )}
      <CardContent className={cn(padClass, glow && 'relative z-10')}>
        <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
          {icon}
          <p className={labelClass}>{label}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ModeValue({ mode }: { mode: ModeResult | null }) {
  if (!mode) {
    return (
      <>
        <p className={valueClass}>{EMPTY}</p>
        <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5">No data</p>
      </>
    );
  }
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <p className={valueClass}>{mode.label}</p>
      <p className="text-[9px] sm:text-[10px] text-[#8a8f98] shrink-0">({mode.count}×)</p>
    </div>
  );
}

/** Compact filter-bound chips used on Asset Detail (row under asset metrics). */
export function TransactionFilterStats({
  transactions,
  clients = [],
}: TransactionFilterStatsProps) {
  const stats = useMemo(() => {
    if (transactions.length === 0) {
      return {
        volume: 0,
        txCount: 0,
        duration: EMPTY,
        dateRange: 'No data',
        topActivity: null as ModeResult | null,
        topNetwork: null as ModeResult | null,
        topCounterparty: null as ModeResult | null,
      };
    }

    const volume = transactions.reduce((sum, tx) => sum + txUsdValue(tx), 0);
    const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const activityMode = findMode(
      transactions.map((tx) => tx.activity || 'Transfer')
    );

    const networkMode = findMode(
      transactions.map((tx) => tx.networkLabel || tx.network).filter(Boolean)
    );

    const counterparties = transactions
      .map((tx) => counterpartyDisplay(tx, clients))
      .filter((item): item is { key: string; label: string } => item !== null);

    let topCounterparty: ModeResult | null = null;
    if (counterparties.length > 0) {
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
      topCounterparty = best;
    }

    return {
      volume,
      txCount: transactions.length,
      duration: formatHumanDuration(minDate, maxDate),
      dateRange: `From ${minDate} to ${maxDate}`,
      topActivity: activityMode,
      topNetwork: networkMode,
      topCounterparty,
    };
  }, [transactions, clients]);

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      <StatCard
        icon={<CalendarRange className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
        label="Active Period"
      >
        <p className={valueClass}>{stats.duration}</p>
        <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
          {stats.dateRange}
        </p>
      </StatCard>

      <StatCard
        icon={<Activity className="h-3 w-3 shrink-0 text-[#f7931a]" />}
        label="Top Activity"
      >
        <ModeValue mode={stats.topActivity} />
      </StatCard>

      <StatCard
        icon={<Globe className="h-3 w-3 shrink-0 text-[#627eea]" />}
        label="Top Network"
      >
        <ModeValue mode={stats.topNetwork} />
      </StatCard>

      <StatCard
        icon={<Users className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
        label="Top Counterparty"
      >
        {stats.topCounterparty ? (
          <div className="flex items-baseline gap-1 min-w-0">
            <p
              className={valueClass}
              dir="ltr"
              title={stats.topCounterparty.label}
            >
              {stats.topCounterparty.label}
            </p>
            <p className="text-[9px] sm:text-[10px] text-[#8a8f98] shrink-0">
              ({stats.topCounterparty.count}×)
            </p>
          </div>
        ) : (
          <>
            <p className={valueClass}>{EMPTY}</p>
            <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5">No data</p>
          </>
        )}
      </StatCard>

      <StatCard
        icon={<ArrowUpDown className="h-3 w-3 shrink-0 text-[#0052ff]" />}
        label="Volume"
      >
        <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
          ${formatUsd(stats.volume)}
        </p>
        <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
          Across {stats.txCount} transaction{stats.txCount === 1 ? '' : 's'}
        </p>
      </StatCard>
    </div>
  );
}

/** Client Detail: 2×5 filter-bound stats (same transaction set as the table). */
export function ClientTransactionFilterStats({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const stats = useMemo(() => {
    if (transactions.length === 0) {
      return {
        revenue: 0,
        expense: 0,
        netFlow: 0,
        volume: 0,
        txCount: 0,
        topToken: null as ModeResult | null,
        duration: EMPTY,
        dateRange: 'No data',
        topActivity: null as ModeResult | null,
        topNetwork: null as ModeResult | null,
        avgValue: null as number | null,
      };
    }

    let revenue = 0;
    let expense = 0;
    let volume = 0;
    for (const tx of transactions) {
      const abs = txUsdValue(tx);
      volume += abs;
      if (isRevenueType(tx.type)) revenue += tx.value;
      if (isExpenseType(tx.type)) expense += tx.value;
    }

    const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    return {
      revenue,
      expense,
      netFlow: revenue - expense,
      volume,
      txCount: transactions.length,
      topToken: findMode(transactions.map((tx) => tx.token).filter(Boolean)),
      duration: formatHumanDuration(minDate, maxDate),
      dateRange: `From ${minDate} to ${maxDate}`,
      topActivity: findMode(
        transactions.map((tx) => tx.activity || 'Transfer')
      ),
      topNetwork: findMode(
        transactions.map((tx) => tx.networkLabel || tx.network).filter(Boolean)
      ),
      avgValue: volume / transactions.length,
    };
  }, [transactions]);

  const isNetPositive = stats.netFlow >= 0;
  const empty = transactions.length === 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<ArrowDownLeft className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Revenue"
          glow="rgba(14, 203, 129, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.revenue)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpRight className="h-3 w-3 shrink-0 text-[#f6465d]" />}
          label="Expense"
          glow="rgba(246, 70, 93, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f6465d] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.expense)}`}
          </p>
        </StatCard>

        <StatCard
          icon={
            isNetPositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
            )
          }
          label="Net Flow"
          glow={
            isNetPositive
              ? 'rgba(14, 203, 129, 0.06)'
              : 'rgba(246, 70, 93, 0.06)'
          }
        >
          <p
            className={cn(
              'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
              isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            )}
          >
            {empty
              ? EMPTY
              : `${isNetPositive ? '+' : ''}$${formatUsd(stats.netFlow)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpDown className="h-3 w-3 shrink-0 text-[#0052ff]" />}
          label="Volume"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.volume)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<FileText className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Transactions"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.txCount}
          </p>
        </StatCard>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Wallet className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Token"
        >
          <ModeValue mode={stats.topToken} />
        </StatCard>

        <StatCard
          icon={<CalendarRange className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Active Period"
        >
          <p className={valueClass}>{stats.duration}</p>
          <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
            {stats.dateRange}
          </p>
        </StatCard>

        <StatCard
          icon={<Activity className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Activity"
        >
          <ModeValue mode={stats.topActivity} />
        </StatCard>

        <StatCard
          icon={<Globe className="h-3 w-3 shrink-0 text-[#627eea]" />}
          label="Top Network"
        >
          <ModeValue mode={stats.topNetwork} />
        </StatCard>

        <StatCard
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Avg Value"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.avgValue == null ? EMPTY : `$${formatUsd(stats.avgValue)}`}
          </p>
        </StatCard>
      </div>
    </div>
  );
}

/** Network Detail: 2×5 filter-bound stats (no Top Network — page is already one network). */
export function NetworkTransactionFilterStats({
  transactions,
  clients = [],
}: TransactionFilterStatsProps) {
  const stats = useMemo(() => {
    if (transactions.length === 0) {
      return {
        revenue: 0,
        expense: 0,
        netFlow: 0,
        volume: 0,
        txCount: 0,
        topToken: null as ModeResult | null,
        duration: EMPTY,
        dateRange: 'No data',
        topActivity: null as ModeResult | null,
        topCounterparty: null as ModeResult | null,
        avgValue: null as number | null,
      };
    }

    let revenue = 0;
    let expense = 0;
    let volume = 0;
    for (const tx of transactions) {
      const abs = txUsdValue(tx);
      volume += abs;
      if (isRevenueType(tx.type)) revenue += tx.value;
      if (isExpenseType(tx.type)) expense += tx.value;
    }

    const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const counterparties = transactions
      .map((tx) => counterpartyDisplay(tx, clients))
      .filter((item): item is { key: string; label: string } => item !== null);

    let topCounterparty: ModeResult | null = null;
    if (counterparties.length > 0) {
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
      topCounterparty = best;
    }

    return {
      revenue,
      expense,
      netFlow: revenue - expense,
      volume,
      txCount: transactions.length,
      topToken: findMode(transactions.map((tx) => tx.token).filter(Boolean)),
      duration: formatHumanDuration(minDate, maxDate),
      dateRange: `From ${minDate} to ${maxDate}`,
      topActivity: findMode(
        transactions.map((tx) => tx.activity || 'Transfer')
      ),
      topCounterparty,
      avgValue: volume / transactions.length,
    };
  }, [transactions, clients]);

  const isNetPositive = stats.netFlow >= 0;
  const empty = transactions.length === 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<ArrowDownLeft className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Revenue"
          glow="rgba(14, 203, 129, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.revenue)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpRight className="h-3 w-3 shrink-0 text-[#f6465d]" />}
          label="Expense"
          glow="rgba(246, 70, 93, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f6465d] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.expense)}`}
          </p>
        </StatCard>

        <StatCard
          icon={
            isNetPositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
            )
          }
          label="Net Flow"
          glow={
            isNetPositive
              ? 'rgba(14, 203, 129, 0.06)'
              : 'rgba(246, 70, 93, 0.06)'
          }
        >
          <p
            className={cn(
              'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
              isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            )}
          >
            {empty
              ? EMPTY
              : `${isNetPositive ? '+' : ''}$${formatUsd(stats.netFlow)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpDown className="h-3 w-3 shrink-0 text-[#0052ff]" />}
          label="Volume"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.volume)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<FileText className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Transactions"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.txCount}
          </p>
        </StatCard>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Wallet className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Token"
        >
          <ModeValue mode={stats.topToken} />
        </StatCard>

        <StatCard
          icon={<CalendarRange className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Active Period"
        >
          <p className={valueClass}>{stats.duration}</p>
          <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
            {stats.dateRange}
          </p>
        </StatCard>

        <StatCard
          icon={<Activity className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Activity"
        >
          <ModeValue mode={stats.topActivity} />
        </StatCard>

        <StatCard
          icon={<Users className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Top Counterparty"
        >
          {stats.topCounterparty ? (
            <div className="flex items-baseline gap-1 min-w-0">
              <p
                className={valueClass}
                dir="ltr"
                title={stats.topCounterparty.label}
              >
                {stats.topCounterparty.label}
              </p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] shrink-0">
                ({stats.topCounterparty.count}×)
              </p>
            </div>
          ) : (
            <>
              <p className={valueClass}>{EMPTY}</p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5">
                No data
              </p>
            </>
          )}
        </StatCard>

        <StatCard
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Avg Value"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.avgValue == null ? EMPTY : `$${formatUsd(stats.avgValue)}`}
          </p>
        </StatCard>
      </div>
    </div>
  );
}

/**
 * Type Detail: 2×5 filter-bound stats for one classification (Income, Expense, …).
 * No Top Type — page is already scoped. Activity/token/network still vary.
 */
export function TypeTransactionFilterStats({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const stats = useMemo(() => {
    if (transactions.length === 0) {
      return {
        revenue: 0,
        expense: 0,
        netFlow: 0,
        volume: 0,
        txCount: 0,
        topToken: null as ModeResult | null,
        duration: EMPTY,
        dateRange: 'No data',
        topActivity: null as ModeResult | null,
        topNetwork: null as ModeResult | null,
        avgValue: null as number | null,
      };
    }

    let revenue = 0;
    let expense = 0;
    let volume = 0;
    for (const tx of transactions) {
      const abs = txUsdValue(tx);
      volume += abs;
      if (isRevenueType(tx.type)) revenue += tx.value;
      if (isExpenseType(tx.type)) expense += tx.value;
    }

    const dates = transactions.map((tx) => tx.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    return {
      revenue,
      expense,
      netFlow: revenue - expense,
      volume,
      txCount: transactions.length,
      topToken: findMode(transactions.map((tx) => tx.token).filter(Boolean)),
      duration: formatHumanDuration(minDate, maxDate),
      dateRange: `From ${minDate} to ${maxDate}`,
      topActivity: findMode(
        transactions.map((tx) => tx.activity || 'Transfer')
      ),
      topNetwork: findMode(
        transactions.map((tx) => tx.networkLabel || tx.network).filter(Boolean)
      ),
      avgValue: volume / transactions.length,
    };
  }, [transactions]);

  const isNetPositive = stats.netFlow >= 0;
  const empty = transactions.length === 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<ArrowDownLeft className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Revenue"
          glow="rgba(14, 203, 129, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.revenue)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpRight className="h-3 w-3 shrink-0 text-[#f6465d]" />}
          label="Expense"
          glow="rgba(246, 70, 93, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f6465d] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.expense)}`}
          </p>
        </StatCard>

        <StatCard
          icon={
            isNetPositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
            )
          }
          label="Net Flow"
          glow={
            isNetPositive
              ? 'rgba(14, 203, 129, 0.06)'
              : 'rgba(246, 70, 93, 0.06)'
          }
        >
          <p
            className={cn(
              'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
              isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            )}
          >
            {empty
              ? EMPTY
              : `${isNetPositive ? '+' : ''}$${formatUsd(stats.netFlow)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpDown className="h-3 w-3 shrink-0 text-[#0052ff]" />}
          label="Volume"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.volume)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<FileText className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Transactions"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.txCount}
          </p>
        </StatCard>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Wallet className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Token"
        >
          <ModeValue mode={stats.topToken} />
        </StatCard>

        <StatCard
          icon={<CalendarRange className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Active Period"
        >
          <p className={valueClass}>{stats.duration}</p>
          <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
            {stats.dateRange}
          </p>
        </StatCard>

        <StatCard
          icon={<Activity className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Activity"
        >
          <ModeValue mode={stats.topActivity} />
        </StatCard>

        <StatCard
          icon={<Globe className="h-3 w-3 shrink-0 text-[#627eea]" />}
          label="Top Network"
        >
          <ModeValue mode={stats.topNetwork} />
        </StatCard>

        <StatCard
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Avg Value"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.avgValue == null ? EMPTY : `$${formatUsd(stats.avgValue)}`}
          </p>
        </StatCard>
      </div>
    </div>
  );
}
