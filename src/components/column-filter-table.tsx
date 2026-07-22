'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  X,
  Copy,
  Check,
  Search,
} from 'lucide-react';
import {
  networks,
  type Transaction,
  type Client,
  getClientNameByAddress,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 10;

const typeColors: Record<string, string> = {
  income: 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
  expense: 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20',
  trade: 'bg-[#0052ff]/10 text-[#0052ff] border-[#0052ff]/20',
  defi: 'bg-[#627eea]/10 text-[#627eea] border-[#627eea]/20',
  staking: 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20',
  gas: 'bg-[#8a8f98]/10 text-[#8a8f98] border-[#8a8f98]/20',
};

interface ColumnFilterTableProps {
  transactions: Transaction[];
  fixedType?: Transaction['type'];
  fixedTypeLabel?: string;
  showTypeColumn?: boolean;
  onFilteredDataChange?: (data: Transaction[]) => void;
  clients?: Client[];
}

// Column header filter popup component
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
        sideOffset={4}
      >
        {filterContent}
      </PopoverContent>
    </Popover>
  );
}

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
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by Date</p>
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
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by Token</p>
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

// Amount range filter
function AmountFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
  onAll,
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  onAll: () => void;
}) {
  return (
    <div className="space-y-2 w-52">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by Amount</p>
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

// Network search filter
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
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by Network</p>
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
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Search by Tx Hash</p>
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

export function ColumnFilterTable({
  transactions,
  fixedType,
  fixedTypeLabel,
  showTypeColumn = true,
  onFilteredDataChange,
  clients = [],
}: ColumnFilterTableProps) {
  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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

  // Copy state
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Apply filters
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Fixed type filter
    if (fixedType) {
      result = result.filter(tx => tx.type === fixedType);
    }

    // Date filter
    if (dateFrom) {
      result = result.filter(tx => tx.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(tx => tx.date <= dateTo);
    }

    // Token filter
    if (tokenSearch) {
      result = result.filter(tx => tx.token.toLowerCase().includes(tokenSearch.toLowerCase()));
    }

    // Amount filter
    if (amountMin) {
      result = result.filter(tx => tx.value >= parseFloat(amountMin));
    }
    if (amountMax) {
      result = result.filter(tx => tx.value <= parseFloat(amountMax));
    }

    // Network filter
    if (networkSearch) {
      result = result.filter(tx => tx.network === networkSearch);
    }

    // Hash filter
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
  }, [transactions, fixedType, dateFrom, dateTo, tokenSearch, amountMin, amountMax, networkSearch, hashSearch, sortField, sortDir]);

  // Notify parent of filtered data changes
  useEffect(() => {
    onFilteredDataChange?.(filteredTransactions);
  }, [filteredTransactions, onFilteredDataChange]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
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

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHash(id);
      setTimeout(() => setCopiedHash(null), 2000);
    } catch {
      // Fallback
    }
  };

  const hasActiveFilters = !!(dateFrom || dateTo || tokenSearch || amountMin || amountMax || networkSearch || hashSearch);

  const clearAllFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTokenSearch('');
    setAmountMin('');
    setAmountMax('');
    setNetworkSearch('');
    setHashSearch('');
    setCurrentPage(1);
  };

  const uniqueTokens = useMemo(() => [...new Set(transactions.map(tx => tx.token))], [transactions]);

  // Check which columns have active filters
  const dateFilterActive = !!(dateFrom || dateTo);
  const tokenFilterActive = !!tokenSearch;
  const amountFilterActive = !!(amountMin || amountMax);
  const networkFilterActive = !!networkSearch;
  const hashFilterActive = !!hashSearch;

  // Total value of filtered transactions
  const totalFilteredValue = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [filteredTransactions]);

  return (
    <div>
      {/* Active filters bar */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0f1011] border-b border-white/5 flex-wrap">
          <span className="text-[10px] text-[#8a8f98]">Active Filters:</span>
          {dateFilterActive && (
            <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
              Date {dateFrom && `from ${dateFrom}`} {dateTo && `to ${dateTo}`}
              <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setDateFrom(''); setDateTo(''); }} />
            </Badge>
          )}
          {tokenFilterActive && (
            <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
              Token: {tokenSearch}
              <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => setTokenSearch('')} />
            </Badge>
          )}
          {amountFilterActive && (
            <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
              Amount {amountMin && `from $${amountMin}`} {amountMax && `to $${amountMax}`}
              <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => { setAmountMin(''); setAmountMax(''); }} />
            </Badge>
          )}
          {networkFilterActive && (
            <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
              Network: {networks.find(n => n.value === networkSearch)?.label || networkSearch}
              <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => setNetworkSearch('')} />
            </Badge>
          )}
          {hashFilterActive && (
            <Badge variant="outline" className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5">
              Hash: {hashSearch.slice(0, 10)}...
              <X className="h-2.5 w-2.5 mr-1 cursor-pointer" onClick={() => setHashSearch('')} />
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-[#8a8f98] hover:text-[#f7f8f8] text-[10px] h-6 px-2"
            onClick={clearAllFilters}
          >
            Clear All
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

              {/* On-chain activity (explorer-style) */}
              <TableHead className="text-xs font-medium p-2">
                <div className="flex items-center gap-1 text-[#8a8f98]">
                  <span>Activity</span>
                </div>
              </TableHead>

              {/* Accounting classification */}
              {showTypeColumn && (
                <TableHead className="text-xs font-medium p-2">
                  <div className="flex items-center gap-1 text-[#8a8f98]">
                    <span>{fixedTypeLabel || 'Classification'}</span>
                  </div>
                </TableHead>
              )}

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
                    hasActiveFilter={amountFilterActive}
                    filterContent={
                      <AmountFilter
                        min={amountMin}
                        max={amountMax}
                        onMinChange={(v) => { setAmountMin(v); setCurrentPage(1); }}
                        onMaxChange={(v) => { setAmountMax(v); setCurrentPage(1); }}
                        onAll={() => { setAmountMin(''); setAmountMax(''); setCurrentPage(1); }}
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
                <TableCell colSpan={showTypeColumn ? 10 : 9} className="text-center py-12">
                  <div className="text-[#8a8f98]">
                    <p className="text-sm">No transactions found</p>
                    <p className="text-xs mt-1">Try changing the filters</p>
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
                  {showTypeColumn && (
                    <TableCell className="p-2.5">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-2 py-0 border font-medium', typeColors[tx.type])}
                      >
                        {tx.typeLabel}
                      </Badge>
                    </TableCell>
                  )}
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
                        return clientName ? (
                          <>
                            <span className="text-[11px] text-[#b6509e] font-medium">{clientName}</span>
                            <span className="text-[9px] text-[#8a8f98] font-mono" dir="ltr">{truncateHash(tx.counterparty)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[11px] text-[#d0d6e0] font-medium">{tx.counterpartyLabel}</span>
                            <span className="text-[9px] text-[#8a8f98] font-mono" dir="ltr">{truncateHash(tx.counterparty)}</span>
                          </>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="p-2.5" dir="ltr">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-num text-xs text-[#0052ff] cursor-pointer hover:underline">
                        {truncateHash(tx.txHash)}
                      </span>
                      <button
                        className="p-1 rounded hover:bg-[#28282c] transition-colors"
                        onClick={() => copyToClipboard(tx.txHash, tx.id)}
                        title="Copy"
                      >
                        {copiedHash === tx.id ? (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#8a8f98]">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)} of {filteredTransactions.length}
            </p>
            <span className="text-[#8a8f98]">|</span>
            <p className="text-xs text-[#d0d6e0] font-mono-num">
              Total: ${formatNumber(totalFilteredValue)}
            </p>
          </div>
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
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
            ))}
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
        </div>
      )}
    </div>
  );
}
