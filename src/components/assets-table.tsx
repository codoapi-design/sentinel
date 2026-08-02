'use client';

import { useMemo, useEffect, useCallback, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Loader2,
  Filter,
  X,
  Search,
  Check,
} from 'lucide-react';
import { usePortfolio, type PortfolioData, type PortfolioToken } from '@/hooks/use-portfolio';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  filterVisibleAssets,
  isHiddenSpamOrDustAsset,
} from '@/lib/finance/visibility';
import { ShowSpamDustToggle } from '@/components/show-spam-dust-toggle';
import { AssetsPageFilterStats } from '@/components/assets-filter-stats';
import { AIAnalysisSection } from '@/components/ai-analysis-section';
import { cn } from '@/lib/utils';

interface AssetsTableProps {
  onAssetClick?: (assetId: string) => void;
  onFilteredDataChange?: (data: PortfolioToken[]) => void;
  /** Optional shared portfolio (avoids relying on a second mount when parent already fetched). */
  portfolio?: PortfolioData | null;
  isLoading?: boolean;
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ────────────────────────────────────────────────
// Column header filter popup (same UX as Transactions)
// ────────────────────────────────────────────────
function ColumnFilterPopup({
  children,
  filterContent,
  hasActiveFilter,
  align = 'start',
}: {
  children: React.ReactNode;
  filterContent: React.ReactNode;
  hasActiveFilter: boolean;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 w-full transition-colors rounded px-1 py-0.5 -mx-1',
            hasActiveFilter
              ? 'text-[#0052ff]'
              : 'text-[#8a8f98] hover:text-[#d0d6e0]',
          )}
        >
          {children}
          <Filter
            className={cn(
              'h-3 w-3 transition-opacity',
              hasActiveFilter ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto bg-[#191a1b] border-white/10 p-3 shadow-xl"
        align={align}
        dir="ltr"
        sideOffset={4}
      >
        {filterContent}
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select checkbox list (Asset / Chain). Optional search for long lists. */
function MultiSelectFilter({
  title,
  selected,
  options,
  onToggle,
  onAll,
  searchable,
}: {
  title: string;
  selected: string[];
  options: { value: string; label: string }[];
  onToggle: (value: string) => void;
  onAll: () => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = searchable
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.value.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  return (
    <div className="space-y-2 w-52">
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">{title}</p>
      {searchable && (
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#8a8f98]" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#0f1011] border-white/10 text-[#d0d6e0] placeholder-[#8a8f98] text-xs h-8 pr-8"
          />
        </div>
      )}
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-[#8a8f98] px-2 py-1">No matches</p>
        ) : (
          filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                'w-full text-left text-xs px-2 py-1.5 rounded transition-colors flex items-center gap-2',
                selected.includes(opt.value)
                  ? 'bg-[#0052ff]/10 text-[#0052ff]'
                  : 'hover:bg-[#28282c] text-[#d0d6e0]',
              )}
              onClick={() => onToggle(opt.value)}
            >
              <div
                className={cn(
                  'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                  selected.includes(opt.value)
                    ? 'bg-[#0052ff] border-[#0052ff]'
                    : 'border-[#8a8f98]/40',
                )}
              >
                {selected.includes(opt.value) && (
                  <Check className="h-2.5 w-2.5 text-white" />
                )}
              </div>
              <span className="truncate">{opt.label}</span>
            </button>
          ))
        )}
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

function ValueRangeFilter({
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
      <p className="text-xs font-medium text-[#d0d6e0] mb-2">Filter by value</p>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[#8a8f98]">Greater than ($)</label>
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
        <label className="text-[10px] text-[#8a8f98]">Less than ($)</label>
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

// ────────────────────────────────────────────────
// Sidebar Assets tab (stats always visible)
// ────────────────────────────────────────────────
interface AssetsTabProps {
  onAssetClick?: (assetId: string) => void;
}

/**
 * Full sidebar Assets view: filter-bound 2×4 stats + table.
 * Stats track the same visible list as AssetsTable (spam/$0 + column filters).
 */
export function AssetsTab({ onAssetClick }: AssetsTabProps) {
  const { portfolio, isLoading } = usePortfolio();
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const rawTokens = useMemo(() => portfolio?.tokens || [], [portfolio?.tokens]);
  const visibleTokens = useMemo(
    () => filterVisibleAssets(rawTokens, showSpamAndDust),
    [rawTokens, showSpamAndDust],
  );

  const [filteredData, setFilteredData] = useState<PortfolioToken[]>(visibleTokens);
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    if (!filtersReady) {
      setFilteredData(visibleTokens);
    }
  }, [visibleTokens, filtersReady]);

  const handleFilteredDataChange = useCallback((data: PortfolioToken[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const statsAssets = filtersReady ? filteredData : visibleTokens;
  const portfolioValueUsd = useMemo(
    () => statsAssets.reduce((sum, token) => sum + (token.valueUsd || 0), 0),
    [statsAssets],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Assets</h2>
        <p className="text-sm text-[#8a8f98]">Details of all your digital assets</p>
      </div>
      <AssetsPageFilterStats assets={statsAssets} />
      <AssetsTable
        portfolio={portfolio}
        isLoading={isLoading}
        onAssetClick={onAssetClick}
        onFilteredDataChange={handleFilteredDataChange}
      />
      <AIAnalysisSection
        assets={statsAssets}
        portfolioValueUsd={portfolioValueUsd}
        assetsMode="replace"
        sectionTitle="Assets"
        sectionType="assets"
        page="assets"
        includeHidden={showSpamAndDust}
      />
    </div>
  );
}

export function AssetsTable({
  onAssetClick,
  onFilteredDataChange,
  portfolio: portfolioProp,
  isLoading: isLoadingProp,
}: AssetsTableProps) {
  const hooked = usePortfolio();
  const portfolio = portfolioProp ?? hooked.portfolio;
  const isLoading = isLoadingProp ?? hooked.isLoading;
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);

  const rawTokens = useMemo(() => portfolio?.tokens || [], [portfolio?.tokens]);
  const visibleTokens = useMemo(
    () => filterVisibleAssets(rawTokens, showSpamAndDust),
    [rawTokens, showSpamAndDust],
  );
  const hasHiddenItems = useMemo(
    () => rawTokens.some((t) => isHiddenSpamOrDustAsset(t, false)),
    [rawTokens],
  );

  // Column filters
  const [symbolFilter, setSymbolFilter] = useState<string[]>([]);
  const [chainFilter, setChainFilter] = useState<string[]>([]);
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');

  const assetOptions = useMemo(() => {
    const bySymbol = new Map<string, string>();
    for (const t of visibleTokens) {
      if (!bySymbol.has(t.symbol)) {
        bySymbol.set(t.symbol, t.name ? `${t.symbol} · ${t.name}` : t.symbol);
      }
    }
    return [...bySymbol.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }, [visibleTokens]);

  const chainOptions = useMemo(() => {
    const chains = [...new Set(visibleTokens.map((t) => t.chain).filter(Boolean))];
    return chains
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: capitalize(c) }));
  }, [visibleTokens]);

  const filteredTokens = useMemo(() => {
    let result = visibleTokens;

    if (symbolFilter.length > 0) {
      result = result.filter((t) => symbolFilter.includes(t.symbol));
    }
    if (chainFilter.length > 0) {
      result = result.filter((t) => chainFilter.includes(t.chain));
    }
    if (valueMin) {
      const min = parseFloat(valueMin);
      if (!Number.isNaN(min)) {
        result = result.filter((t) => (t.valueUsd || 0) >= min);
      }
    }
    if (valueMax) {
      const max = parseFloat(valueMax);
      if (!Number.isNaN(max)) {
        result = result.filter((t) => (t.valueUsd || 0) <= max);
      }
    }

    return result;
  }, [visibleTokens, symbolFilter, chainFilter, valueMin, valueMax]);

  useEffect(() => {
    onFilteredDataChange?.(filteredTokens);
  }, [filteredTokens, onFilteredDataChange]);

  const totalAssetsValue = useMemo(
    () => filteredTokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0),
    [filteredTokens],
  );

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems: pagedTokens,
    totalItems,
  } = useTablePagination(filteredTokens);

  const symbolFilterActive = symbolFilter.length > 0;
  const chainFilterActive = chainFilter.length > 0;
  const valueFilterActive = !!(valueMin || valueMax);
  const hasActiveFilters = symbolFilterActive || chainFilterActive || valueFilterActive;

  const toggleSymbol = (symbol: string) => {
    setSymbolFilter((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
    setPage(1);
  };

  const toggleChain = (chain: string) => {
    setChainFilter((prev) =>
      prev.includes(chain) ? prev.filter((c) => c !== chain) : [...prev, chain],
    );
    setPage(1);
  };

  const clearAllFilters = () => {
    setSymbolFilter([]);
    setChainFilter([]);
    setValueMin('');
    setValueMax('');
    setPage(1);
  };

  // Loading state
  if (isLoading && rawTokens.length === 0) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="h-4 w-4 text-[#0052ff] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading assets from blockchain...</span>
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 bg-white/5 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-white/5 rounded w-20 mb-1" />
                <div className="h-3 bg-white/5 rounded w-12" />
              </div>
              <div className="h-4 bg-white/5 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No tokens at all
  if (rawTokens.length === 0) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6 text-center">
        <p className="text-sm text-[#8a8f98]">No token balances found</p>
        <p className="text-xs text-[#8a8f98]/60 mt-1">
          Add a wallet with blockchain activity to see token balances
        </p>
      </div>
    );
  }

  // All tokens hidden by spam / dust filter
  if (visibleTokens.length === 0) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-[#f7f8f8] text-base font-medium">Assets</h3>
          <ShowSpamDustToggle compact />
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-[#8a8f98]">No assets to show</p>
          {hasHiddenItems && (
            <p className="text-xs text-[#8a8f98]/60 mt-1">
              Enable Show spam & $0 if you expect dust
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl">
      <div className="p-4 pb-0 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[#f7f8f8] text-base font-medium">Assets</h3>
          <p className="text-xs text-[#8a8f98] mt-1">
            {filteredTokens.length} of {visibleTokens.length} tokens across{' '}
            {portfolio?.chainBreakdown?.length || 0} chains
            {hasHiddenItems && !showSpamAndDust ? ' · spam & $0 hidden' : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ShowSpamDustToggle compact />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-[#8a8f98]">Total Value</p>
            <p className="text-lg font-bold text-[#f7f8f8] font-mono-num leading-tight">
              {formatValue(totalAssetsValue)}
            </p>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center gap-2 px-4 py-2 mt-3 border-y border-white/5 flex-wrap">
          <span className="text-[10px] text-[#8a8f98]">Active Filters:</span>
          {symbolFilterActive && (
            <Badge
              variant="outline"
              className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5"
            >
              Asset: {symbolFilter.join(', ')}
              <X
                className="h-2.5 w-2.5 ml-1 cursor-pointer"
                onClick={() => {
                  setSymbolFilter([]);
                  setPage(1);
                }}
              />
            </Badge>
          )}
          {chainFilterActive && (
            <Badge
              variant="outline"
              className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5"
            >
              Chain: {chainFilter.map(capitalize).join(', ')}
              <X
                className="h-2.5 w-2.5 ml-1 cursor-pointer"
                onClick={() => {
                  setChainFilter([]);
                  setPage(1);
                }}
              />
            </Badge>
          )}
          {valueFilterActive && (
            <Badge
              variant="outline"
              className="text-[10px] bg-[#0052ff]/5 text-[#0052ff] border-[#0052ff]/20 px-2 py-0.5"
            >
              Value{valueMin ? ` ≥ $${valueMin}` : ''}
              {valueMax ? ` ≤ $${valueMax}` : ''}
              <X
                className="h-2.5 w-2.5 ml-1 cursor-pointer"
                onClick={() => {
                  setValueMin('');
                  setValueMax('');
                  setPage(1);
                }}
              />
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

      <div className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-xs font-medium p-2">
                <div className="group">
                  <ColumnFilterPopup
                    hasActiveFilter={symbolFilterActive}
                    filterContent={
                      <MultiSelectFilter
                        title="Filter by asset"
                        selected={symbolFilter}
                        options={assetOptions}
                        onToggle={toggleSymbol}
                        onAll={() => {
                          setSymbolFilter([]);
                          setPage(1);
                        }}
                        searchable
                      />
                    }
                  >
                    <span>Asset</span>
                  </ColumnFilterPopup>
                </div>
              </TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">
                Quantity
              </TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">
                Price
              </TableHead>
              <TableHead className="text-xs font-medium p-2 text-right">
                <div className="group flex justify-end">
                  <ColumnFilterPopup
                    hasActiveFilter={valueFilterActive}
                    align="end"
                    filterContent={
                      <ValueRangeFilter
                        min={valueMin}
                        max={valueMax}
                        onMinChange={(v) => {
                          setValueMin(v);
                          setPage(1);
                        }}
                        onMaxChange={(v) => {
                          setValueMax(v);
                          setPage(1);
                        }}
                        onAll={() => {
                          setValueMin('');
                          setValueMax('');
                          setPage(1);
                        }}
                      />
                    }
                  >
                    <span className="ml-auto">Value</span>
                  </ColumnFilterPopup>
                </div>
              </TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">
                24H
              </TableHead>
              <TableHead className="text-xs font-medium p-2 text-right">
                <div className="group flex justify-end">
                  <ColumnFilterPopup
                    hasActiveFilter={chainFilterActive}
                    align="end"
                    filterContent={
                      <MultiSelectFilter
                        title="Filter by chain"
                        selected={chainFilter}
                        options={chainOptions}
                        onToggle={toggleChain}
                        onAll={() => {
                          setChainFilter([]);
                          setPage(1);
                        }}
                      />
                    }
                  >
                    <span className="ml-auto">Chain</span>
                  </ColumnFilterPopup>
                </div>
              </TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedTokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="text-[#8a8f98]">
                    <p className="text-sm">No assets found</p>
                    <p className="text-xs mt-1">Try changing the filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pagedTokens.map((token, i) => {
                const rowIndex = (page - 1) * pageSize + i;
                const isPositive = (token.change24h || 0) >= 0;
                const color = `hsl(${(rowIndex * 37) % 360}, 60%, 50%)`;
                return (
                  <TableRow
                    key={`${token.symbol}-${token.chain}-${rowIndex}`}
                    className="border-white/5 hover:bg-[#191a1b]/50 transition-colors cursor-pointer group"
                    onClick={() => onAssetClick?.(token.symbol)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: `${color}20`, color: color }}
                        >
                          {token.logoUrl ? (
                            <img
                              src={token.logoUrl}
                              alt={token.symbol}
                              className="w-9 h-9 rounded-full"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML =
                                  token.symbol.slice(0, 2);
                              }}
                            />
                          ) : (
                            token.symbol.slice(0, 2)
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f7f8f8]">
                            {token.name || token.symbol}
                          </p>
                          <p className="text-xs text-[#8a8f98]">{token.symbol}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm text-[#d0d6e0]">
                        {token.balance < 0.0001
                          ? '<0.0001'
                          : formatNumber(token.balance, token.balance > 100 ? 2 : 4)}
                      </span>
                      <span className="text-xs text-[#8a8f98] ml-1">{token.symbol}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm text-[#d0d6e0]">
                        {formatValue(token.priceUsd)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm font-medium text-[#f7f8f8]">
                        {formatValue(token.valueUsd)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {token.change24h !== null && token.change24h !== undefined ? (
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono-num ${
                            isPositive
                              ? 'bg-[#0ecb81]/10 text-[#0ecb81]'
                              : 'bg-[#f6465d]/10 text-[#f6465d]'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {isPositive ? '+' : ''}
                          {token.change24h.toFixed(2)}%
                        </div>
                      ) : (
                        <span className="text-xs text-[#8a8f98]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-[#8a8f98] capitalize">{token.chain}</span>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-[#8a8f98] group-hover:text-[#d0d6e0] transition-colors opacity-0 group-hover:opacity-100 transform group-hover:translate-x-0.5 transition-transform" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        alwaysShow
        extraLeft={
          <>
            <span className="text-[#8a8f98] text-[10px]">|</span>
            <p className="text-xs text-[#d0d6e0] font-mono-num">
              Total: {formatValue(totalAssetsValue)}
            </p>
          </>
        }
      />
    </div>
  );
}
