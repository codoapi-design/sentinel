'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { assets } from '@/lib/mock-data';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

interface AssetsTableProps {
  onAssetClick?: (assetId: string) => void;
}

export function AssetsTable({ onAssetClick }: AssetsTableProps) {
  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardHeader className="pb-4">
        <CardTitle className="text-[#f7f8f8] text-base">Assets</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-[#8a8f98] text-xs font-medium">Asset</TableHead>
                <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Quantity</TableHead>
                <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Price</TableHead>
                <TableHead className="text-[#8a8f98] text-xs font-medium text-right">Value</TableHead>
                <TableHead className="text-[#8a8f98] text-xs font-medium text-right">24H</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => {
                const isPositive = asset.change24h >= 0;
                return (
                  <TableRow
                    key={asset.id}
                    className="border-white/5 hover:bg-[#191a1b]/50 transition-colors cursor-pointer group"
                    onClick={() => onAssetClick?.(asset.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                          style={{ backgroundColor: `${asset.color}20` }}
                        >
                          {asset.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f7f8f8]">{asset.name}</p>
                          <p className="text-xs text-[#8a8f98]">{asset.symbol}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm text-[#d0d6e0]">
                        {asset.symbol === 'WBTC' ? formatNumber(asset.quantity, 4) : formatNumber(asset.quantity)}
                      </span>
                      <span className="text-xs text-[#8a8f98] mr-1">{asset.symbol}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm text-[#d0d6e0]">
                        ${formatNumber(asset.price)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono-num text-sm font-medium text-[#f7f8f8]">
                        ${formatNumber(asset.value)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono-num ${
                        isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                      }`}>
                        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {isPositive ? '+' : ''}{asset.change24h}%
                      </div>
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
      </CardContent>
    </Card>
  );
}
