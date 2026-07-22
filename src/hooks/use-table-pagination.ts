'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/components/table-pagination';

/**
 * Slice a list into pages and keep the current page in range when the list shrinks.
 */
export function useTablePagination<T>(
  items: T[],
  initialPageSize: number = DEFAULT_TABLE_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    pageItems,
    totalItems: items.length,
  };
}
