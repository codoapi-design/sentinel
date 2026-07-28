'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  X,
  ArrowUpDown,
  Filter,
  Copy,
  Check,
  Search,
  ExternalLink,
  Hash,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Fuel,
  Globe,
  Calendar,
  Coins,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  transactionTypes,
  networks,
  type Transaction,
  type Client,
  getClientNameByAddress,
} from '@/lib/mock-data';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import { cn } from '@/lib/utils';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  filterVisibleTransactions,
  isHiddenSpamOrDustTx,
} from '@/lib/finance/visibility';
import { ON_CHAIN_ACTIVITY_LABELS } from '@/lib/finance/activity';
import { ShowSpamDustToggle } from '@/components/show-spam-dust-toggle';
import { TransactionsPageFilterStats } from '@/components/transaction-filter-stats';

const typeColors: Record<string, string> = {
  income: 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
  expense: 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20',
  trade: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  defi: 'bg-[#627eea]/10 text-[#627eea] border-[#627eea]/20',
  staking: 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20',
  gas: 'bg-[#8a8f98]/10 text-[#8a8f98] border-[#8a8f98]/20',
};

const typeIcons: Record<string, React.ReactNode> = {
  income: <ArrowDownLeft className="h-4 w-4 text-[#0ecb81]" />,
  expense: <ArrowUpRight className="h-4 w-4 text-[#f6465d]" />,
  trade: <Receipt className="h-4 w-4 text-[#0052ff]" />,
  defi: <Coins className="h-4 w-4 text-[#627eea]" />,
  staking: <Coins className="h-4 w-4 text-[#f7931a]" />,
  gas: <Fuel className="h-4 w-4 text-[#8a8f98]" />,
};

// ────────────────────────────────────────────────
// Column Header Filter Popup
// ────────────────────────────────────────────────
function ColumnFilterPopup({
  children,
  filterContent,
  hasActiveFilter,
}: {
  children: React.ReactNode;
  filterContent: React.ReactNode;
  hasActiveFilter: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 w-full transition-colors rounded px-1 py-0.5 -mx-1',
            hasActiveFilter
              ? 'text-[#0052ff]'
              : 'text-[#8a8f98] hover:text-[#d0d6e0]'
          )}
        >
          {children}
          <Filter className={cn(
            'h-3 w-3 transition-opacity',
            hasActiveFilter ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          )} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto bg-[#191a1b] border-white/10 p-3 shadow-xl"
        align="start"
        dir="ltr"
        sideOffset={4}
      >
        {filterContent}
      </PopoverContent>
    </Popover>
  );
}

// ────────────────────────────────────────────────
// Filter Components
// ────────────────────────────────────────────────

// Date range filter
function DateFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onAll,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="space-y-2 w-56">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by date</p>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[#8a8f98]">From</label>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] text-xs h-8"
          dir="ltr"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[#8a8f98]">To</label>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] text-xs h-8"
          dir="ltr"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// Type filter
function TypeFilter({
  selected,
  onToggle,
  onAll,
}: {
  selected: string[];
  onToggle: (type: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="space-y-2 w-48">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by type</p>
      <div className="space-y-1">
        {transactionTypes.map(type => (
          <button
            key={type.value}
            className={cn(
              'w-full text-right text-xs px-2 py-1.5 rounded transition-colors flex items-center gap-2',
              selected.includes(type.value)
                ? 'bg-[#0052ff]/10 text-[#0052ff]'
                : 'hover:bg-[#28282c] text-[#d0d6e0]'
            )}
            onClick={() => onToggle(type.value)}
          >
            <div className={cn(
              'w-3.5 h-3.5 rounded border flex items-center justify-center',
              selected.includes(type.value)
                ? 'bg-[#0052ff] border-[#0052ff]'
                : 'border-[#8a8f98]/40'
            )}>
              {selected.includes(type.value) && (
                <Check className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            {type.label}
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// On-chain activity filter
function ActivityFilter({
  selected,
  onToggle,
  onAll,
  options,
}: {
  selected: string[];
  onToggle: (activity: string) => void;
  onAll: () => void;
  options: string[];
}) {
  return (
    <div className="space-y-2 w-52">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by activity</p>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {options.map(activity => (
          <button
            key={activity}
            className={cn(
              'w-full text-right text-xs px-2 py-1.5 rounded transition-colors flex items-center gap-2',
              selected.includes(activity)
                ? 'bg-[#0052ff]/10 text-[#0052ff]'
                : 'hover:bg-[#28282c] text-[#d0d6e0]'
            )}
            onClick={() => onToggle(activity)}
          >
            <div className={cn(
              'w-3.5 h-3.5 rounded border flex items-center justify-center',
              selected.includes(activity)
                ? 'bg-[#0052ff] border-[#0052ff]'
                : 'border-[#8a8f98]/40'
            )}>
              {selected.includes(activity) && (
                <Check className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            {activity}
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// Token search filter
function TokenFilter({
  search,
  onSearchChange,
  onAll,
  availableTokens,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onAll: () => void;
  availableTokens: string[];
}) {
  return (
    <div className="space-y-2 w-48">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by token</p>
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#8a8f98]" />
        <Input
          placeholder="Search token..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-xs h-8 pr-8"
        />
      </div>
      {search && (
        <div className="max-h-32 overflow-y-auto space-y-1">
          {availableTokens
            .filter(t => t.toLowerCase().includes(search.toLowerCase()))
            .map(token => (
              <button
                key={token}
                className="w-full text-right text-xs px-2 py-1.5 rounded hover:bg-[#28282c] text-[#d0d6e0] transition-colors"
                onClick={() => onSearchChange(token)}
              >
                {token}
              </button>
            ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// Amount/Quantity range filter
function AmountFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
  onAll,
  label = 'Amount',
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  onAll: () => void;
  label?: string;
}) {
  return (
    <div className="space-y-2 w-52">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by {label}</p>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[#8a8f98]">Greater than</label>
        <Input
          type="number"
          placeholder="0.00"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-xs h-8"
          dir="ltr"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[#8a8f98]">Less than</label>
        <Input
          type="number"
          placeholder="0.00"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-xs h-8"
          dir="ltr"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// Network filter
function NetworkFilter({
  search,
  onSearchChange,
  onAll,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="space-y-2 w-48">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by network</p>
      <div className="space-y-1">
        {networks.map(net => (
          <button
            key={net.value}
            className={cn(
              'w-full text-right text-xs px-2 py-1.5 rounded transition-colors',
              search === net.value
                ? 'bg-[#0052ff]/10 text-[#0052ff]'
                : 'hover:bg-[#28282c] text-[#d0d6e0]'
            )}
            onClick={() => onSearchChange(net.value)}
          >
            {net.label}
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// Hash search filter
function HashFilter({
  search,
  onSearchChange,
  onAll,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="space-y-2 w-64">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Search by tx hash</p>
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#8a8f98]" />
        <Input
          placeholder="0x..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="bg-[#0f1011] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-xs h-8 pr-8 font-mono"
          dir="ltr"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full bg-[#0f1011] border-white/10 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#28282c] text-xs h-7"
        onClick={onAll}
      >
        ALL
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────
// Transaction Detail Modal
// ────────────────────────────────────────────────
function TransactionDetailModal({
  tx,
  open,
  onClose,
  onCopyHash,
  onCopyCounterparty,
  copiedField,
  clients = [],
}: {
  tx: Transaction | null;
  open: boolean;
  onClose: () => void;
  onCopyHash: (text: string) => void;
  onCopyCounterparty: (text: string) => void;
  copiedField: string | null;
  clients?: Client[];
}) {
  if (!tx) return null;

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const getExplorerUrl = (network: string, hash: string) => {
    const explorers: Record<string, string> = {
      ethereum: 'https://etherscan.io',
      base: 'https://basescan.org',
      arbitrum: 'https://arbiscan.io',
      optimism: 'https://optimistic.etherscan.io',
      bsc: 'https://bscscan.com',
    };
    return `${explorers[network] || 'https://etherscan.io'}/tx/${hash}`;
  };

  const counterpartyDisplay = resolveCounterpartyDisplay(
    {
      counterparty: tx.counterparty,
      counterpartyLabel: tx.counterpartyLabel,
    },
    clients,
  );

  const detailItems = [
    { icon: <Calendar className="h-4 w-4 text-[#8a8f98]" />, label: 'Date', value: tx.date },
    { icon: <Hash className="h-4 w-4 text-[#8a8f98]" />, label: 'Activity', value: tx.activity || 'Transfer' },
    { icon: typeIcons[tx.type], label: 'Classification', value: tx.typeLabel, badge: true },
    { icon: <Coins className="h-4 w-4 text-[#8a8f98]" />, label: 'Token', value: tx.token },
    { icon: <Hash className="h-4 w-4 text-[#8a8f98]" />, label: 'Quantity', value: tx.token === 'WBTC' ? formatNumber(tx.quantity, 6) : formatNumber(tx.quantity) },
    { icon: <Receipt className="h-4 w-4 text-[#8a8f98]" />, label: 'Price', value: `$${formatNumber(tx.price)}` },
    { icon: <Wallet className="h-4 w-4 text-[#8a8f98]" />, label: 'Value', value: `$${formatNumber(tx.value)}` },
    { icon: <Globe className="h-4 w-4 text-[#8a8f98]" />, label: 'Network', value: tx.networkLabel },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0f1011] border-white/10 text-[#f7f8f8] max-w-lg" dir="ltr">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[#0052ff]" />
            Transaction Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Tx Hash */}
          <div className="bg-[#191a1b] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#8a8f98] uppercase tracking-wide">Transaction Hash</span>
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded hover:bg-[#28282c] transition-colors"
                  onClick={() => onCopyHash(tx.txHash)}
                  title="Copy"
                >
                  {copiedField === 'hash' ? (
                    <Check className="h-3.5 w-3.5 text-[#0ecb81]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[#8a8f98]" />
                  )}
                </button>
                <a
                  href={getExplorerUrl(tx.network, tx.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded hover:bg-[#28282c] transition-colors"
                  title="View on blockchain"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#0052ff]" />
                </a>
              </div>
            </div>
            <p className="font-mono text-[11px] text-[#d0d6e0] break-all" dir="ltr">{tx.txHash}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2">
            {detailItems.map((item, idx) => (
              <div key={idx} className="bg-[#191a1b] rounded-lg p-3 flex items-center gap-2.5">
                <div className="shrink-0">{item.icon}</div>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#8a8f98]">{item.label}</p>
                  {item.badge ? (
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] px-1.5 py-0 border font-medium mt-0.5', typeColors[tx.type])}
                    >
                      {item.value}
                    </Badge>
                  ) : (
                    <p className="text-xs text-[#f7f8f8] font-medium truncate">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Counterparty */}
          <div className="bg-[#191a1b] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#8a8f98] uppercase tracking-wide">Counterparty</span>
              <button
                className="p-1.5 rounded hover:bg-[#28282c] transition-colors"
                onClick={() => onCopyCounterparty(tx.counterparty)}
                title="Copy address"
              >
                {copiedField === 'counterparty' ? (
                  <Check className="h-3.5 w-3.5 text-[#0ecb81]" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[#8a8f98]" />
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#d0d6e0] font-medium">{counterpartyDisplay}</span>
            </div>
            <p className="font-mono text-[11px] text-[#8a8f98] break-all" dir="ltr">{tx.counterparty}</p>
          </div>

          {/* Blockchain Link */}
          <a
            href={getExplorerUrl(tx.network, tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-[#0052ff] hover:bg-[#0052ff]/80 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View on blockchain
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────
// Sidebar Transactions tab (stats always visible)
// ────────────────────────────────────────────────
interface TransactionsTabProps {
  clients?: Client[];
  transactions?: Transaction[];
}

/**
 * Full sidebar Transactions view: filter-bound 2×5 stats + table.
 * Stats initialize from the full list immediately (no empty wait for filtersReady).
 */
export function TransactionsTab({
  clients = [],
  transactions = [],
}: TransactionsTabProps) {
  const [filteredData, setFilteredData] = useState<Transaction[]>(transactions);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    if (!filtersReady) {
      setFilteredData(transactions);
    }
  }, [transactions, filtersReady]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const statsTransactions = filtersReady ? filteredData : transactions;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Transactions</h2>
        <p className="text-sm text-[#8a8f98]">View and filter all your transactions</p>
      </div>
      <TransactionsPageFilterStats
        transactions={statsTransactions}
        clients={clients}
      />
      <TransactionsTable
        clients={clients}
        transactions={transactions}
        onFilteredDataChange={handleFilteredDataChange}
      />
    </div>
  );
}

// ────────────────────────────────────────────────
// Main TransactionsTable Component
// ────────────────────────────────────────────────
interface TransactionsTableProps {
  clients?: Client[];
  transactions?: Transaction[];
  /**
   * @deprecated Prefer wrapping with `TransactionsTab` for the sidebar tab.
   * When true, also render stats above the table (kept for compatibility).
   */
  showFilterStats?: boolean;
  onFilteredDataChange?: (data: Transaction[]) => void;
}

export function TransactionsTable({
  clients = [],
  transactions = [],
  showFilterStats = false,
  onFilteredDataChange,
}: TransactionsTableProps) {
  // Purely presentational: transactions are supplied by the parent dashboard
  // (real synced data from the store, or demo mock data). No data is generated here.
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const hasHiddenItems = useMemo(
    () => transactions.some((tx) => isHiddenSpamOrDustTx(tx, false)),
    [transactions],
  );
  const allTransactions = useMemo(
    () => filterVisibleTransactions(transactions, showSpamAndDust),
    [transactions, showSpamAndDust],
  );

  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activityFilter, setActivityFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [tokenSearch, setTokenSearch] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [networkSearch, setNetworkSearch] = useState('');
  const [hashSearch, setHashSearch] = useState('');

  // Sort state
  const [sortField, setSortField] = useState<keyof Transaction>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCounterpartyId, setCopiedCounterpartyId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Transaction detail modal
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Apply filters
  const filteredTransactions = useMemo(() => {
    let result = [...allTransactions];

    if (activityFilter.length > 0) {
      result = result.filter(tx => activityFilter.includes(tx.activity || 'Transfer'));
    }
    if (typeFilter.length > 0) {
      result = result.filter(tx => typeFilter.includes(tx.type));
    }
    if (dateFrom) {
      result = result.filter(tx => tx.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(tx => tx.date <= dateTo);
    }
    if (tokenSearch) {
      result = result.filter(tx => tx.token.toLowerCase().includes(tokenSearch.toLowerCase()));
    }
    if (amountMin) {
      result = result.filter(tx => tx.value >= parseFloat(amountMin));
    }
    if (amountMax) {
      result = result.filter(tx => tx.value <= parseFloat(amountMax));
    }
    if (networkSearch) {
      result = result.filter(tx => tx.network === networkSearch);
    }
    if (hashSearch) {
      result = result.filter(tx => tx.txHash.toLowerCase().includes(hashSearch.toLowerCase()));
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });

    return result;
  }, [allTransactions, activityFilter, typeFilter, dateFrom, dateTo, tokenSearch, amountMin, amountMax, networkSearch, hashSearch, sortField, sortDir]);

  useEffect(() => {
    onFilteredDataChange?.(filteredTransactions);
  }, [filteredTransactions, onFilteredDataChange]);

  // Total value of filtered transactions
  const totalFilteredValue = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [filteredTransactions]);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: 'Transactions',
        subtitle: 'Filtered wallet transactions',
        filenameBase: 'sentinel-transactions',
        transactions: filteredTransactions,
        clients,
        aiScope: {
          page: 'transactions',
          sectionType: 'transactions',
          sectionTitle: 'Transactions',
        },
        extraSummary: [
          {
            label: 'Filtered total (USD)',
            value: `$${totalFilteredValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        ],
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      const aiIncluded = await downloadReportExcel(payload);
      toast.success(
        aiIncluded
          ? 'Excel report downloaded (with AI analysis)'
          : 'Excel report downloaded',
      );
    } catch {
      toast.error('Failed to export Excel');
    }
  }, [filteredTransactions, totalFilteredValue, clients]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: 'Transactions',
        subtitle: 'Filtered wallet transactions',
        filenameBase: 'sentinel-transactions',
        transactions: filteredTransactions,
        clients,
        aiScope: {
          page: 'transactions',
          sectionType: 'transactions',
          sectionTitle: 'Transactions',
        },
        extraSummary: [
          {
            label: 'Filtered total (USD)',
            value: `$${totalFilteredValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        ],
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      const aiIncluded = await downloadReportPdf(payload);
      toast.success(
        aiIncluded
          ? 'PDF report downloaded (with AI analysis)'
          : 'PDF report downloaded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }, [filteredTransactions, totalFilteredValue, clients]);

  const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const toggleSort = (field: keyof Transaction) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  const copyToClipboard = async (text: string, id: string, type: 'hash' | 'counterparty') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'hash') {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        setCopiedCounterpartyId(id);
        setTimeout(() => setCopiedCounterpartyId(null), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const copyModalField = async (text: string, field: 'hash' | 'counterparty') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback
    }
  };

  const toggleTypeFilter = (type: string) => {
    if (typeFilter.includes(type)) {
      setTypeFilter(typeFilter.filter(t => t !== type));
    } else {
      setTypeFilter([...typeFilter, type]);
    }
    setCurrentPage(1);
  };

  const toggleActivityFilter = (activity: string) => {
    if (activityFilter.includes(activity)) {
      setActivityFilter(activityFilter.filter(a => a !== activity));
    } else {
      setActivityFilter([...activityFilter, activity]);
    }
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setDateFrom('');
    setDateTo('');
    setActivityFilter([]);
    setTypeFilter([]);
    setTokenSearch('');
    setAmountMin('');
    setAmountMax('');
    setNetworkSearch('');
    setHashSearch('');
    setCurrentPage(1);
  };

  const hasActiveFilters = activityFilter.length > 0 || typeFilter.length > 0 || !!dateFrom || !!dateTo || !!tokenSearch || !!amountMin || !!amountMax || !!networkSearch || !!hashSearch;

  // Check which columns have active filters
  const dateFilterActive = !!(dateFrom || dateTo);
  const activityFilterActive = activityFilter.length > 0;
  const typeFilterActive = typeFilter.length > 0;
  const tokenFilterActive = !!tokenSearch;
  const amountFilterActive = !!(amountMin || amountMax);
  const networkFilterActive = !!networkSearch;
  const hashFilterActive = !!hashSearch;

  const uniqueTokens = useMemo(() => [...new Set(allTransactions.map(tx => tx.token))], [allTransactions]);

  const activityOptions = useMemo(() => {
    const fromData = allTransactions.map(tx => tx.activity || 'Transfer');
    const extras = fromData.filter(
      (label) => !(ON_CHAIN_ACTIVITY_LABELS as readonly string[]).includes(label),
    );
    return [...new Set([...ON_CHAIN_ACTIVITY_LABELS, ...extras])];
  }, [allTransactions]);

  // Handle tx hash click → open detail modal
  const handleTxClick = (tx: Transaction) => {
    setSelectedTx(tx);
    setModalOpen(true);
  };

  // Smart pagination: show max 7 page buttons
  const getVisiblePages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: number[] = [];
    pages.push(1);
    if (currentPage > 3) pages.push(-1); // ellipsis
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push(-2); // ellipsis
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="space-y-4">
      {showFilterStats && (
        <TransactionsPageFilterStats
          transactions={filteredTransactions}
          clients={clients}
        />
      )}
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-[#f7f8f8] text-base">Transactions</CardTitle>
              <p className="text-xs text-[#8a8f98] mt-1">
                {filteredTransactions.length} transactions
                {hasHiddenItems && !showSpamAndDust ? ' · spam & $0 hidden' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <ShowSpamDustToggle compact />
              <Button
                variant="outline"
                size="sm"
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
                onClick={handleDownloadPdf}
              >
                <FileText className="h-4 w-4 ml-1" />
                Download PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
                onClick={handleDownloadExcel}
              >
                <FileSpreadsheet className="h-4 w-4 ml-1" />
                Download Excel
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Active filters bar */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[#0f1011] border-b border-white/5 flex-wrap">
              <span className="text-[10px] text-[#8a8f98]">Active filters:</span>
              {dateFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Date {dateFrom && `from ${dateFrom}`} {dateTo && `to ${dateTo}`}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }} />
                </Badge>
              )}
              {activityFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Activity: {activityFilter.join(', ')}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setActivityFilter([]); setCurrentPage(1); }} />
                </Badge>
              )}
              {typeFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Classification: {typeFilter.map(t => transactionTypes.find(tt => tt.value === t)?.label).join(', ')}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setTypeFilter([]); setCurrentPage(1); }} />
                </Badge>
              )}
              {tokenFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Token: {tokenSearch}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setTokenSearch(''); setCurrentPage(1); }} />
                </Badge>
              )}
              {amountFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Amount {amountMin && `from $${amountMin}`} {amountMax && `to $${amountMax}`}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setAmountMin(''); setAmountMax(''); setCurrentPage(1); }} />
                </Badge>
              )}
              {networkFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Network: {networks.find(n => n.value === networkSearch)?.label || networkSearch}
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setNetworkSearch(''); setCurrentPage(1); }} />
                </Badge>
              )}
              {hashFilterActive && (
                <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
                  Hash: {hashSearch.slice(0, 10)}...
                  <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setHashSearch(''); setCurrentPage(1); }} />
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-[#8a8f98] hover:text-[#f7f8f8] text-[10px] h-6 px-2"
                onClick={clearAllFilters}
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  {/* Date column */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={dateFilterActive}
                        filterContent={
                          <DateFilter
                            from={dateFrom}
                            to={dateTo}
                            onFromChange={(v) => { setDateFrom(v); setCurrentPage(1); }}
                            onToChange={(v) => { setDateTo(v); setCurrentPage(1); }}
                            onAll={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                          />
                        }
                      >
                        <div className="flex items-center gap-1" onClick={() => toggleSort('date')}>
                          <span>Date</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* On-chain activity */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={activityFilterActive}
                        filterContent={
                          <ActivityFilter
                            selected={activityFilter}
                            onToggle={toggleActivityFilter}
                            onAll={() => { setActivityFilter([]); setCurrentPage(1); }}
                            options={activityOptions}
                          />
                        }
                      >
                        <div className="flex items-center gap-1" onClick={() => toggleSort('activity')}>
                          <span>Activity</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Accounting classification */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={typeFilterActive}
                        filterContent={
                          <TypeFilter
                            selected={typeFilter}
                            onToggle={toggleTypeFilter}
                            onAll={() => { setTypeFilter([]); setCurrentPage(1); }}
                          />
                        }
                      >
                        <div className="flex items-center gap-1" onClick={() => toggleSort('type')}>
                          <span>Classification</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Token column */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={tokenFilterActive}
                        filterContent={
                          <TokenFilter
                            search={tokenSearch}
                            onSearchChange={(v) => { setTokenSearch(v); setCurrentPage(1); }}
                            onAll={() => { setTokenSearch(''); setCurrentPage(1); }}
                            availableTokens={uniqueTokens}
                          />
                        }
                      >
                        <div className="flex items-center gap-1" onClick={() => toggleSort('token')}>
                          <span>Token</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Quantity column */}
                  <TableHead className="text-xs font-medium p-2 text-right">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={false}
                        filterContent={
                          <AmountFilter
                            min={amountMin}
                            max={amountMax}
                            onMinChange={(v) => { setAmountMin(v); setCurrentPage(1); }}
                            onMaxChange={(v) => { setAmountMax(v); setCurrentPage(1); }}
                            onAll={() => { setAmountMin(''); setAmountMax(''); setCurrentPage(1); }}
                            label="Quantity"
                          />
                        }
                      >
                        <div className="flex items-center justify-end gap-1" onClick={() => toggleSort('quantity')}>
                          <span>Quantity</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Price column */}
                  <TableHead className="text-xs font-medium text-[#8a8f98] p-2 text-right">Price</TableHead>

                  {/* Value column */}
                  <TableHead className="text-xs font-medium p-2 text-right">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={amountFilterActive}
                        filterContent={
                          <AmountFilter
                            min={amountMin}
                            max={amountMax}
                            onMinChange={(v) => { setAmountMin(v); setCurrentPage(1); }}
                            onMaxChange={(v) => { setAmountMax(v); setCurrentPage(1); }}
                            onAll={() => { setAmountMin(''); setAmountMax(''); setCurrentPage(1); }}
                            label="Value"
                          />
                        }
                      >
                        <div className="flex items-center justify-end gap-1" onClick={() => toggleSort('value')}>
                          <span>Value</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Network column */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={networkFilterActive}
                        filterContent={
                          <NetworkFilter
                            search={networkSearch}
                            onSearchChange={(v) => { setNetworkSearch(v); setCurrentPage(1); }}
                            onAll={() => { setNetworkSearch(''); setCurrentPage(1); }}
                          />
                        }
                      >
                        <div className="flex items-center gap-1" onClick={() => toggleSort('network')}>
                          <span>Network</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>

                  {/* Counterparty column */}
                  <TableHead className="text-xs font-medium text-[#8a8f98] p-2">Counterparty</TableHead>

                  {/* Hash column */}
                  <TableHead className="text-xs font-medium p-2">
                    <div className="group">
                      <ColumnFilterPopup
                        hasActiveFilter={hashFilterActive}
                        filterContent={
                          <HashFilter
                            search={hashSearch}
                            onSearchChange={(v) => { setHashSearch(v); setCurrentPage(1); }}
                            onAll={() => { setHashSearch(''); setCurrentPage(1); }}
                          />
                        }
                      >
                        <span>Tx Hash</span>
                      </ColumnFilterPopup>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <div className="text-[#8a8f98]">
                        <p className="text-sm">No transactions found</p>
                        {hasHiddenItems && !showSpamAndDust && allTransactions.length === 0 ? (
                          <p className="text-xs mt-1">
                            Enable Show spam & $0 if you expect dust
                          </p>
                        ) : (
                          <p className="text-xs mt-1">Try changing the filters</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTransactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="border-white/5 hover:bg-[#191a1b]/50 transition-colors"
                    >
                      <TableCell className="text-xs text-[#d0d6e0] font-mono-num p-2.5">
                        {tx.date}
                      </TableCell>
                      <TableCell className="p-2.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-2 py-0 border font-medium border-white/15 text-[#d0d6e0] bg-white/5"
                        >
                          {tx.activity || 'Transfer'}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-2.5">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-2 py-0 border font-medium', typeColors[tx.type])}
                        >
                          {tx.typeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-2.5">
                        <span className="text-sm font-medium text-[#f7f8f8]">{tx.token}</span>
                      </TableCell>
                      <TableCell className="text-right p-2.5">
                        <span className="font-mono-num text-xs text-[#d0d6e0]">
                          {tx.token === 'WBTC' ? formatNumber(tx.quantity, 6) : formatNumber(tx.quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right p-2.5">
                        <span className="font-mono-num text-xs text-[#8a8f98]">
                          ${formatNumber(tx.price)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right p-2.5">
                        <span className="font-mono-num text-xs font-medium text-[#f7f8f8]">
                          ${formatNumber(tx.value)}
                        </span>
                      </TableCell>
                      <TableCell className="p-2.5">
                        <span className="text-xs text-[#8a8f98]">{tx.networkLabel}</span>
                      </TableCell>
                      <TableCell className="p-2.5">
                        <div className="flex flex-col">
                          {(() => {
                            const clientName = getClientNameByAddress(tx.counterparty, clients);
                            const display = resolveCounterpartyDisplay(
                              {
                                counterparty: tx.counterparty,
                                counterpartyLabel: tx.counterpartyLabel,
                              },
                              clients,
                            );
                            return clientName ? (
                              <>
                                <span className="text-[11px] text-[#b6509e] font-medium">{clientName}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-[#8a8f98] font-mono" dir="ltr">{truncateHash(tx.counterparty)}</span>
                                  <button
                                    className="p-0.5 rounded hover:bg-[#28282c] transition-colors"
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(tx.counterparty, tx.id, 'counterparty'); }}
                                    title="Copy address"
                                  >
                                    {copiedCounterpartyId === tx.id ? (
                                      <Check className="h-2.5 w-2.5 text-[#0ecb81]" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5 text-[#8a8f98]" />
                                    )}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="text-[11px] text-[#d0d6e0] font-medium">{display}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-[#8a8f98] font-mono" dir="ltr">{truncateHash(tx.counterparty)}</span>
                                  <button
                                    className="p-0.5 rounded hover:bg-[#28282c] transition-colors"
                                    onClick={(e) => { e.stopPropagation(); copyToClipboard(tx.counterparty, tx.id, 'counterparty'); }}
                                    title="Copy address"
                                  >
                                    {copiedCounterpartyId === tx.id ? (
                                      <Check className="h-2.5 w-2.5 text-[#0ecb81]" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5 text-[#8a8f98]" />
                                    )}
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="p-2.5" dir="ltr">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono-num text-xs text-[#0052ff] cursor-pointer hover:underline"
                            onClick={() => handleTxClick(tx)}
                          >
                            {truncateHash(tx.txHash)}
                          </span>
                          <button
                            className="p-1 rounded hover:bg-[#28282c] transition-colors"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(tx.txHash, tx.id, 'hash'); }}
                            title="Copy"
                          >
                            {copiedId === tx.id ? (
                              <Check className="h-3 w-3 text-[#0ecb81]" />
                            ) : (
                              <Copy className="h-3 w-3 text-[#8a8f98]" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination with row count selector */}
          <div className="flex items-center justify-between p-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8a8f98]">Rows per page:</span>
                <Select
                  value={String(rowsPerPage)}
                  onValueChange={(v) => {
                    setRowsPerPage(Number(v));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-16 bg-[#191a1b] border-white/10 text-[#d0d6e0] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#191a1b] border-white/10">
                    <SelectItem value="5" className="text-xs text-[#d0d6e0]">5</SelectItem>
                    <SelectItem value="10" className="text-xs text-[#d0d6e0]">10</SelectItem>
                    <SelectItem value="25" className="text-xs text-[#d0d6e0]">25</SelectItem>
                    <SelectItem value="50" className="text-xs text-[#d0d6e0]">50</SelectItem>
                    <SelectItem value="100" className="text-xs text-[#d0d6e0]">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-[#8a8f98] text-[10px]">|</span>
              <p className="text-xs text-[#8a8f98]">
                Showing {(currentPage - 1) * rowsPerPage + 1} - {Math.min(currentPage * rowsPerPage, filteredTransactions.length)} of {filteredTransactions.length}
              </p>
              <span className="text-[#8a8f98] text-[10px]">|</span>
              <p className="text-xs text-[#d0d6e0] font-mono-num">
                Total: ${formatNumber(totalFilteredValue)}
              </p>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {getVisiblePages().map((page, idx) =>
                  page < 0 ? (
                    <span key={`ellipsis-${idx}`} className="text-[#8a8f98] text-xs px-1">...</span>
                  ) : (
                    <Button
                      key={page}
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-7 w-7 text-xs',
                        currentPage === page
                          ? 'bg-[#0052ff] text-white hover:bg-[#0052ff]'
                          : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]'
                      )}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  )
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        tx={selectedTx}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCopyHash={(text) => copyModalField(text, 'hash')}
        onCopyCounterparty={(text) => copyModalField(text, 'counterparty')}
        copiedField={copiedField}
        clients={clients}
      />
    </div>
  );
}
