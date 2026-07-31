'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DEFAULT_TABLE_PAGE_SIZE = 10;
export const TABLE_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;

interface TablePaginationProps {
  page: number;
  pageSize?: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** When set, shows a rows-per-page selector like the Transactions table */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Show the footer even when there is only one page (Transactions-style) */
  alwaysShow?: boolean;
  /** Optional content next to the “Showing …” label (e.g. totals) */
  extraLeft?: ReactNode;
  className?: string;
}

/**
 * Shared pagination bar: rows-per-page + range label + « Page X of Y » between arrows.
 */
export function TablePagination({
  page,
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = TABLE_PAGE_SIZE_OPTIONS,
  alwaysShow = false,
  extraLeft,
  className,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  if (!alwaysShow && totalPages <= 1) return null;
  if (totalItems === 0 && !alwaysShow) return null;

  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-white/5',
        className,
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {onPageSizeChange && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#8a8f98]">Rows per page:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  onPageSizeChange(Number(v));
                  onPageChange(1);
                }}
              >
                <SelectTrigger className="h-7 w-16 bg-[#191a1b] border-white/10 text-[#d0d6e0] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#191a1b] border-white/10">
                  {pageSizeOptions.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs text-[#d0d6e0]">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-[#8a8f98] text-[10px]">|</span>
          </>
        )}
        <p className="text-xs text-[#8a8f98]">
          Showing {from} - {to} of {totalItems}
        </p>
        {extraLeft}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-[#d0d6e0] font-medium tabular-nums min-w-[5.5rem] text-center">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
