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

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: number[] = [1];
  if (currentPage > 3) pages.push(-1);
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push(-2);
  pages.push(totalPages);
  return pages;
}

/**
 * Shared pagination bar matching the Transactions table UX.
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
  const visible = getVisiblePages(page, totalPages);

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
        <div className="flex items-center gap-1">
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
          {visible.map((p, idx) =>
            p < 0 ? (
              <span key={`e-${idx}`} className="px-1 text-xs text-[#8a8f98]">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 text-xs',
                  page === p
                    ? 'bg-[#0052ff] text-white hover:bg-[#0052ff]'
                    : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]',
                )}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ),
          )}
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
