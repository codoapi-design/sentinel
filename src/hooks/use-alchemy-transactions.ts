/**
 * Custom hook for fetching wallet transactions from Alchemy API
 * 
 * Provides real-time transaction data with classification,
 * or falls back to mock data when no wallet is connected.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { type Transaction, generateTransactions, defaultClients, type Client } from '@/lib/mock-data';

// ============================================================
// Types for API response
// ============================================================

interface ApiTransaction {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  date: string;
  from: string;
  to: string;
  value: string;
  valueEth: number;
  gasUsed: number;
  gasPrice: string;
  gasFeeEth: number;
  status: boolean;
  type: 'income' | 'expense' | 'trade' | 'defi' | 'staking' | 'gas';
  typeAr: string;
  methodId: string | null;
  methodName: string | null;
  protocol: string | null;
  protocolAr: string | null;
  network: string;
  networkAr: string;
  tokenTransfers: Array<{
    tokenSymbol: string;
    tokenName: string;
    tokenAddress: string;
    from: string;
    to: string;
    value: string;
    decimals: number;
    valueFormatted: number;
  }>;
  direction: 'in' | 'out' | 'self' | 'mixed';
}

interface FetchResult {
  success: boolean;
  data: ApiTransaction[];
  pagination: {
    pageKey: string | null;
    totalFetched: number;
  };
  network: {
    key: string;
    name: string;
    nameAr: string;
  };
  error?: string;
}

// ============================================================
// Convert API transaction to app Transaction format
// ============================================================

function apiToAppTransaction(apiTx: ApiTransaction, index: number): Transaction {
  // Determine the token and quantity
  let token = 'ETH';
  let quantity = apiTx.valueEth;
  let price = 0;
  
  if (apiTx.tokenTransfers.length > 0) {
    const mainTransfer = apiTx.tokenTransfers[0];
    token = mainTransfer.tokenSymbol || 'ETH';
    quantity = mainTransfer.valueFormatted;
  }

  // Estimate price (valueEth / quantity)
  price = quantity > 0 ? apiTx.valueEth / quantity : 0;

  // Determine counterparty
  const userAddr = ''; // Will be set from context
  let counterparty = apiTx.to;
  let counterpartyLabel = apiTx.protocolAr || apiTx.protocol || apiTx.to;

  if (apiTx.direction === 'in') {
    counterparty = apiTx.from;
    counterpartyLabel = apiTx.protocolAr || apiTx.protocol || apiTx.from;
  }

  // Truncate address for label if no protocol
  if (!apiTx.protocol && counterparty.startsWith('0x')) {
    counterpartyLabel = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
  }

  return {
    id: `tx-${apiTx.txHash}-${index}`,
    date: apiTx.date,
    timestamp: apiTx.timestamp,
    type: apiTx.type,
    typeLabel: apiTx.typeAr,
    token,
    quantity,
    price,
    value: apiTx.valueEth,
    network: apiTx.network,
    networkLabel: apiTx.networkAr,
    txHash: apiTx.txHash,
    counterparty,
    counterpartyLabel,
  };
}

// ============================================================
// Hook
// ============================================================

interface UseAlchemyTransactionsOptions {
  walletAddress?: string;
  network?: string;
  useMock?: boolean; // Force mock data (for demo/development)
}

interface UseAlchemyTransactionsReturn {
  transactions: Transaction[];
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  pageKey: string | null;
  loadMore: () => void;
  hasMore: boolean;
  isLive: boolean; // True when using real Alchemy data
}

export function useAlchemyTransactions(
  options: UseAlchemyTransactionsOptions = {}
): UseAlchemyTransactionsReturn {
  const { walletAddress, network = 'ethereum', useMock = false } = options;

  const [apiTransactions, setApiTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>(defaultClients);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Generate mock data as fallback
  const mockTransactions = useMemo(() => generateTransactions(), []);

  // Determine if we should use real data
  const isLive = !!walletAddress && !useMock;

  // Fetch transactions from API
  const fetchTransactions = useCallback(async (page?: string | null) => {
    if (!walletAddress || useMock) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        wallet: walletAddress,
        network,
        maxCount: '50',
      });
      if (page) params.set('pageKey', page);

      const response = await fetch(`/api/transactions?${params.toString()}`);
      const result: FetchResult = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch transactions');
      }

      const newTransactions = result.data.map((apiTx, i) =>
        apiToAppTransaction(apiTx, i)
      );

      if (page) {
        // Append for pagination
        setApiTransactions(prev => [...prev, ...newTransactions]);
      } else {
        // Replace for fresh fetch
        setApiTransactions(newTransactions);
      }

      setPageKey(result.pagination.pageKey);

      // Extract unique counterparties for clients
      const uniqueCounterparties = new Map<string, { address: string; label: string }>();
      [...(page ? apiTransactions : newTransactions), ...(page ? newTransactions : [])].forEach(tx => {
        const key = tx.counterparty.toLowerCase();
        if (!uniqueCounterparties.has(key)) {
          uniqueCounterparties.set(key, { address: tx.counterparty, label: tx.counterpartyLabel });
        }
      });
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, network, useMock]);

  // Initial fetch
  useEffect(() => {
    if (isLive) {
      fetchTransactions();
    }
  }, [isLive, fetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch
  const refetch = useCallback(() => {
    setPageKey(null);
    setFetchTrigger(prev => prev + 1);
  }, []);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (pageKey) {
      fetchTransactions(pageKey);
    }
  }, [pageKey, fetchTransactions]);

  // Return real or mock data
  const transactions = isLive ? apiTransactions : mockTransactions;

  return {
    transactions,
    clients,
    isLoading: isLive ? isLoading : false,
    error: isLive ? error : null,
    refetch,
    pageKey,
    loadMore,
    hasMore: isLive ? !!pageKey : false,
    isLive,
  };
}
