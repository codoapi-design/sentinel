'use client';

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

  const tokens = portfolio?.tokens || [];

  // Loading state
  if (isLoading && tokens.length === 0) {
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

  // No tokens state
  if (tokens.length === 0) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6 text-center">
        <p className="text-sm text-[#8a8f98]">No token balances found</p>
        <p className="text-xs text-[#8a8f98]/60 mt-1">
          Add a wallet with blockchain activity to see token balances
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl">
      <div className="p-4 pb-0">
        <h3 className="text-[#f7f8f8] text-base font-medium">Assets</h3>
        <p className="text-xs text-[#8a8f98] mt-1">{tokens.length} tokens across {portfolio?.chainBreakdown?.length || 0} chains</p>
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
            {tokens.map((token, i) => {
              const isPositive = (token.change24h || 0) >= 0;
              const color = `hsl(${(i * 37) % 360}, 60%, 50%)`;
              return (
                <TableRow
                  key={`${token.symbol}-${token.chain}-${i}`}
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
                    <span className="text-xs text-[#8a8f98] mr-1">{token.symbol}</span>
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
    </div>
  );
}
