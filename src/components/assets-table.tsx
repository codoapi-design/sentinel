'use client';

import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Loader2 } from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  filterVisibleAssets,
  isHiddenSpamOrDustAsset,
} from '@/lib/finance/visibility';
import { ShowSpamDustToggle } from '@/components/show-spam-dust-toggle';

interface AssetsTableProps {
  onAssetClick?: (assetId: string) => void;
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AssetsTable({ onAssetClick }: AssetsTableProps) {
  const { portfolio, isLoading } = usePortfolio();
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);

  const rawTokens = useMemo(() => portfolio?.tokens || [], [portfolio?.tokens]);
  const tokens = useMemo(
    () => filterVisibleAssets(rawTokens, showSpamAndDust),
    [rawTokens, showSpamAndDust],
  );
  const hasHiddenItems = useMemo(
    () => rawTokens.some((t) => isHiddenSpamOrDustAsset(t, false)),
    [rawTokens],
  );

  // Visible Total Value always matches the filtered list (not the raw API total).
  const totalAssetsValue = useMemo(
    () => tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0),
    [tokens],
  );
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems: pagedTokens,
    totalItems,
  } = useTablePagination(tokens);

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
  if (tokens.length === 0) {
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
            {tokens.length} tokens across {portfolio?.chainBreakdown?.length || 0} chains
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
      <div className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-[#8a8f98] text-xs font-medium">Asset</TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Quantity</TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Price</TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Value</TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">24H</TableHead>
              <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Chain</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedTokens.map((token, i) => {
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
                          <img src={token.logoUrl} alt={token.symbol} className="w-9 h-9 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = token.symbol.slice(0, 2); }} />
                        ) : (
                          token.symbol.slice(0, 2)
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#f7f8f8]">{token.name || token.symbol}</p>
                        <p className="text-xs text-[#8a8f98]">{token.symbol}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono-num text-sm text-[#d0d6e0]">
                      {token.balance < 0.0001 ? '<0.0001' : formatNumber(token.balance, token.balance > 100 ? 2 : 4)}
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
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono-num ${
                        isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                      }`}>
                        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {isPositive ? '+' : ''}{token.change24h.toFixed(2)}%
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
            })}
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
