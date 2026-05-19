/**
 * Wallet Store - Zustand
 *
 * Manages wallet state: list of wallets, active wallet, loading states.
 * Handles local persistence + Supabase sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Transaction, generateTransactions, defaultClients, type Client } from '@/lib/mock-data';

// ============================================================
// Types
// ============================================================

export interface WalletInfo {
  id: string;
  address: string;
  label: string;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  transactionCount: number;
}

// Plan limits — aligned with pricing tiers
export const PLAN_LIMITS: Record<string, {
  wallets: number;
  networks: number;
  transactions: number;
  aiChats: number;
  syncIntervalMs: number;
}> = {
  starter: {
    wallets: 1,
    networks: 1, // Ethereum only
    transactions: 500,
    aiChats: 50,
    syncIntervalMs: 600_000, // 10 minutes
  },
  pro: {
    wallets: 5,
    networks: 5,
    transactions: 5000,
    aiChats: 300,
    syncIntervalMs: 60_000, // 1 minute
  },
  enterprise: {
    wallets: 25,
    networks: 10,
    transactions: Infinity,
    aiChats: Infinity,
    syncIntervalMs: 30_000, // 30 seconds
  },
};

// Backward-compatible alias
export const PLAN_WALLET_LIMITS: Record<string, number> = {
  starter: PLAN_LIMITS.starter.wallets,
  pro: PLAN_LIMITS.pro.wallets,
  enterprise: PLAN_LIMITS.enterprise.wallets,
};

interface WalletState {
  // Wallet list
  wallets: WalletInfo[];
  activeWalletId: string | null;

  // Transactions per wallet (keyed by wallet ID)
  transactionsMap: Record<string, Transaction[]>;

  // Clients per wallet (keyed by wallet ID)
  clientsMap: Record<string, Client[]>;

  // Loading states
  isLoadingWallets: boolean;
  isSyncing: Record<string, boolean>; // keyed by wallet ID
  isAddingWallet: boolean;

  // Current user plan
  currentPlan: string;

  // Last sync timestamp
  lastSyncAt: Record<string, number>; // keyed by wallet ID

  // Error state
  error: string | null;
}

interface WalletActions {
  // Wallet CRUD
  addWallet: (address: string, label: string) => Promise<void>;
  removeWallet: (walletId: string) => Promise<void>;
  setActiveWallet: (walletId: string) => void;
  updateWalletLabel: (walletId: string, label: string) => Promise<void>;

  // Data operations
  syncWallet: (walletId: string) => Promise<void>;
  syncAllWallets: () => Promise<void>;
  loadWalletsFromDB: () => Promise<void>;

  // Getters
  getActiveWallet: () => WalletInfo | null;
  getActiveTransactions: () => Transaction[];
  getActiveClients: () => Client[];
  canAddWallet: () => boolean;
  getWalletByAddress: (address: string) => WalletInfo | null;

  // Setters
  setTransactions: (walletId: string, transactions: Transaction[]) => void;
  setClients: (walletId: string, clients: Client[]) => void;
  setCurrentPlan: (plan: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: WalletState = {
  wallets: [],
  activeWalletId: null,
  transactionsMap: {},
  clientsMap: {},
  isLoadingWallets: false,
  isSyncing: {},
  isAddingWallet: false,
  currentPlan: 'pro', // Default to pro for development
  lastSyncAt: {},
  error: null,
};

// Chain name to chainId mapping for API calls
const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
};

export const useWalletStore = create<WalletState & WalletActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Wallet CRUD ======

      addWallet: async (address: string, label: string) => {
        const state = get();

        // Check plan limits
        const limit = PLAN_WALLET_LIMITS[state.currentPlan] ?? 1;
        if (state.wallets.length >= limit) {
          set({ error: `You have reached the wallet limit for your plan (${limit} wallets)` });
          return;
        }

        // Check for duplicate
        const existing = state.wallets.find(
          w => w.address.toLowerCase() === address.toLowerCase()
        );
        if (existing) {
          set({ error: 'This wallet is already added' });
          return;
        }

        set({ isAddingWallet: true, error: null });

        try {
          // Save to Supabase
          let walletId = `wallet-${Date.now()}`;
          let dbSuccess = false;

          try {
            const response = await fetch('/api/wallets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address, label }),
            });

            if (response.ok) {
              const result = await response.json();
              walletId = result.data?.id || walletId;
              dbSuccess = true;
            } else {
              const errData = await response.json().catch(() => ({}));
              console.warn('[WalletStore] Failed to add wallet to DB:', errData.error);
            }
          } catch (err) {
            console.warn('[WalletStore] Supabase not available, using local wallet state:', err);
          }

          const newWallet: WalletInfo = {
            id: walletId,
            address,
            label,
            lastSyncedAt: null,
            isSyncing: false,
            transactionCount: 0,
          };

          set(state => ({
            wallets: [...state.wallets, newWallet],
            activeWalletId: state.activeWalletId || walletId, // Set as active if first wallet
            isAddingWallet: false,
          }));

          // Trigger initial sync (non-blocking)
          get().syncWallet(walletId);
        } catch (error) {
          set({
            isAddingWallet: false,
            error: error instanceof Error ? error.message : 'Failed to add wallet',
          });
        }
      },

      removeWallet: async (walletId: string) => {
        // Note: User said wallets should NOT be deleted, but we'll keep this for future use
        try {
          await fetch(`/api/wallets?id=${walletId}`, { method: 'DELETE' });
        } catch {
          // Local only
        }

        set(state => {
          const newWallets = state.wallets.filter(w => w.id !== walletId);
          const newActiveId =
            state.activeWalletId === walletId
              ? newWallets[0]?.id || null
              : state.activeWalletId;

          const newTxMap = { ...state.transactionsMap };
          const newClientsMap = { ...state.clientsMap };
          const newSyncing = { ...state.isSyncing };
          const newLastSync = { ...state.lastSyncAt };

          delete newTxMap[walletId];
          delete newClientsMap[walletId];
          delete newSyncing[walletId];
          delete newLastSync[walletId];

          return {
            wallets: newWallets,
            activeWalletId: newActiveId,
            transactionsMap: newTxMap,
            clientsMap: newClientsMap,
            isSyncing: newSyncing,
            lastSyncAt: newLastSync,
          };
        });
      },

      setActiveWallet: (walletId: string) => {
        set({ activeWalletId: walletId });
      },

      updateWalletLabel: async (walletId: string, label: string) => {
        try {
          await fetch('/api/wallets', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: walletId, label }),
          });
        } catch {
          // Local only
        }

        set(state => ({
          wallets: state.wallets.map(w =>
            w.id === walletId ? { ...w, label } : w
          ),
        }));
      },

      // ====== Load wallets from DB ======

      loadWalletsFromDB: async () => {
        try {
          const response = await fetch('/api/wallets');
          if (response.ok) {
            const result = await response.json();
            if (result.data && result.data.length > 0) {
              const dbWallets = result.data.map((w: any) => ({
                id: w.id,
                address: w.address,
                label: w.label,
                lastSyncedAt: w.lastSyncedAt,
                isSyncing: false,
                transactionCount: 0,
              }));

              set(state => {
                // Merge: keep local state for wallets that exist in DB, add new DB wallets
                const localIds = new Set(state.wallets.map(w => w.id));
                const merged = [...state.wallets];
                for (const dbW of dbWallets) {
                  if (!localIds.has(dbW.id)) {
                    merged.push(dbW);
                  }
                }
                return {
                  wallets: merged,
                  activeWalletId: state.activeWalletId || merged[0]?.id,
                };
              });
            }
          }
        } catch (err) {
          console.warn('[WalletStore] Failed to load wallets from DB:', err);
        }
      },

      // ====== Data Operations ======

      syncWallet: async (walletId: string) => {
        const state = get();
        const wallet = state.wallets.find(w => w.id === walletId);
        if (!wallet || wallet.isSyncing) return;

        // Set syncing state
        set(state => ({
          isSyncing: { ...state.isSyncing, [walletId]: true },
          error: null,
        }));

        try {
          let transactions: Transaction[] = [];
          let clients: Client[] = [];
          let txCount = 0;

          // Step 1: Trigger proper sync endpoint (fetches balances + DeFi + transactions from providers)
          try {
            const syncResponse = await fetch(`/api/wallets/${walletId}/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'full' }),
            });
            if (syncResponse.ok) {
              const syncResult = await syncResponse.json();
              console.log('[WalletStore] Sync completed:', {
                success: syncResult.success,
                recordsSynced: syncResult.totalRecordsSynced,
                results: syncResult.results,
              });
            } else {
              const errData = await syncResponse.json().catch(() => ({}));
              console.warn('[WalletStore] Sync endpoint returned:', syncResponse.status, errData.error || '');
            }
          } catch (syncError) {
            console.warn('[WalletStore] Sync endpoint error:', syncError);
          }

          // Step 2: Fetch stored transactions from Supabase (populated by sync)
          try {
            const dbResponse = await fetch(`/api/wallets/${walletId}/transactions`);
            if (dbResponse.ok) {
              const dbResult = await dbResponse.json();
              if (dbResult.data && dbResult.data.length > 0) {
                transactions = dbResult.data;
                txCount = transactions.length;
                console.log(`[WalletStore] Got ${txCount} transactions from DB`);
              }
            } else {
              console.warn('[WalletStore] DB transactions fetch failed:', dbResponse.status);
            }
          } catch (err) {
            console.warn('[WalletStore] DB transactions fetch error:', err);
          }

          // Step 3: If still no stored data, fetch from provider APIs directly as fallback
          if (transactions.length === 0) {
            console.log('[WalletStore] No DB transactions, trying provider API fallback...');
            try {
              const chainIds = [1, 8453, 42161, 10, 137]; // ETH, Base, Arbitrum, Optimism, Polygon
              const allTransactions: Transaction[] = [];

              for (const chainId of chainIds) {
                try {
                  const response = await fetch(
                    `/api/transactions?wallet=${wallet.address}&chainId=${chainId}&pageSize=50`
                  );
                  if (response.ok) {
                    const result = await response.json();
                    if (result.data && result.data.length > 0) {
                      const networkTx = result.data.map(
                        (apiTx: Record<string, unknown>, i: number) =>
                          providerApiToAppTransaction(apiTx, i, wallet.address)
                      );
                      allTransactions.push(...networkTx);
                    }
                  }
                } catch {
                  // Skip chain on error
                }
              }

              transactions = allTransactions.sort((a, b) => b.timestamp - a.timestamp);
              txCount = transactions.length;

              console.log(`[WalletStore] Got ${txCount} transactions from provider APIs`);

              // Save to Supabase
              if (transactions.length > 0) {
                try {
                  await fetch(`/api/wallets/${walletId}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactions }),
                  });
                } catch {
                  // Save failed, continue with local state
                }
              }
            } catch (error) {
              console.error('[WalletStore] Error fetching from providers:', error);
              transactions = [];
              txCount = 0;
            }
          }

          // Extract unique clients from transactions
          const clientMap = new Map<string, Client>();
          transactions.forEach(tx => {
            const key = (tx.counterparty || '').toLowerCase();
            if (!key || !key.startsWith('0x')) return;
            if (!clientMap.has(key)) {
              const existingClient = defaultClients.find(
                c => c.address.toLowerCase() === key
              );
              if (existingClient) {
                clientMap.set(key, existingClient);
              } else {
                clientMap.set(key, {
                  id: `client-auto-${key.slice(2, 8)}`,
                  name: tx.counterpartyLabel || `${key.slice(0, 6)}...${key.slice(-4)}`,
                  address: tx.counterparty,
                  notes: '',
                  color: '#8a8f98',
                  createdAt: new Date().toISOString().split('T')[0],
                });
              }
            }
          });
          clients = Array.from(clientMap.values());

          set(state => ({
            transactionsMap: { ...state.transactionsMap, [walletId]: transactions },
            clientsMap: { ...state.clientsMap, [walletId]: clients },
            wallets: state.wallets.map(w =>
              w.id === walletId
                ? { ...w, isSyncing: false, lastSyncedAt: new Date().toISOString(), transactionCount: txCount }
                : w
            ),
            isSyncing: { ...state.isSyncing, [walletId]: false },
            lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
          }));
        } catch (error) {
          set(state => ({
            isSyncing: { ...state.isSyncing, [walletId]: false },
            error: error instanceof Error ? error.message : 'Failed to sync wallet',
          }));
        }
      },

      syncAllWallets: async () => {
        const state = get();
        for (const wallet of state.wallets) {
          if (!state.isSyncing[wallet.id]) {
            await get().syncWallet(wallet.id);
          }
        }
      },

      // ====== Getters ======

      getActiveWallet: () => {
        const state = get();
        return state.wallets.find(w => w.id === state.activeWalletId) || null;
      },

      getActiveTransactions: () => {
        const state = get();
        if (!state.activeWalletId) return [];
        return state.transactionsMap[state.activeWalletId] || [];
      },

      getActiveClients: () => {
        const state = get();
        if (!state.activeWalletId) return [];
        return state.clientsMap[state.activeWalletId] || [];
      },

      canAddWallet: () => {
        const state = get();
        const limit = PLAN_WALLET_LIMITS[state.currentPlan] ?? 1;
        return state.wallets.length < limit;
      },

      getWalletByAddress: (address: string) => {
        return get().wallets.find(
          w => w.address.toLowerCase() === address.toLowerCase()
        ) || null;
      },

      // ====== Setters ======

      setTransactions: (walletId: string, transactions: Transaction[]) => {
        set(state => ({
          transactionsMap: { ...state.transactionsMap, [walletId]: transactions },
        }));
      },

      setClients: (walletId: string, clients: Client[]) => {
        set(state => ({
          clientsMap: { ...state.clientsMap, [walletId]: clients },
        }));
      },

      setCurrentPlan: (plan: string) => {
        set({ currentPlan: plan });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'sentinel-wallets',
      partialize: (state) => ({
        wallets: state.wallets,
        activeWalletId: state.activeWalletId,
        transactionsMap: state.transactionsMap,
        clientsMap: state.clientsMap,
        currentPlan: state.currentPlan,
        lastSyncAt: state.lastSyncAt,
      }),
    }
  )
);

// ============================================================
// Helper: Convert Provider API transaction to app Transaction format
// Used when fetching from /api/transactions endpoint
// ============================================================

function providerApiToAppTransaction(
  apiTx: Record<string, unknown>,
  index: number,
  userAddress: string
): Transaction {
  const userAddr = userAddress.toLowerCase();
  const fromAddr = ((apiTx.from as string) || '').toLowerCase();
  const toAddr = ((apiTx.to as string) || '').toLowerCase();
  const isFromUser = fromAddr === userAddr;
  const isToUser = toAddr === userAddr;

  // Determine type and direction
  let type: Transaction['type'] = 'income';
  let direction = 'in';
  if (isFromUser && isToUser) {
    direction = 'self';
    type = 'income';
  } else if (isFromUser) {
    direction = 'out';
    type = 'expense';
  } else {
    direction = 'in';
    type = 'income';
  }

  // Token info
  let token = 'ETH';
  let quantity = (apiTx.value as number) || 0;
  let price = 0;

  const tokenTransfers = apiTx.tokenTransfers as Array<Record<string, unknown>> | undefined;
  if (tokenTransfers && tokenTransfers.length > 0) {
    const mainTransfer = tokenTransfers[0];
    token = (mainTransfer.symbol as string) || (mainTransfer.tokenSymbol as string) || 'ETH';
    quantity = (mainTransfer.amount as number) || (mainTransfer.valueFormatted as number) || 0;
  }

  price = quantity > 0 ? ((apiTx.value as number) || 0) / quantity : 0;

  // Counterparty
  let counterparty = direction === 'out' ? toAddr : fromAddr;
  let counterpartyLabel = (apiTx.protocol as string) || '';

  if (!counterpartyLabel && counterparty.startsWith('0x')) {
    counterpartyLabel = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
  }

  // Network
  const chain = (apiTx.chain as string) || 'ethereum';
  const chainId = (apiTx.chainId as number) || 1;

  const NETWORK_LABELS: Record<string, string> = {
    ethereum: 'Ethereum',
    base: 'Base',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    polygon: 'Polygon',
  };

  const TYPE_LABELS: Record<string, string> = {
    income: 'Income',
    expense: 'Expense',
    trade: 'Trade',
    defi: 'DeFi',
    staking: 'Staking',
    gas: 'Gas Fee',
    nft: 'NFT',
    bridge: 'Bridge',
  };

  return {
    id: `tx-${(apiTx.hash as string) || index}-${index}`,
    date: (apiTx.date as string) || new Date().toISOString().split('T')[0],
    timestamp: (apiTx.timestamp as number) || Date.now(),
    type,
    typeLabel: TYPE_LABELS[type] || type,
    token,
    quantity,
    price,
    value: (apiTx.value as number) || 0,
    network: chain,
    networkLabel: NETWORK_LABELS[chain] || chain.charAt(0).toUpperCase() + chain.slice(1),
    txHash: (apiTx.hash as string) || '',
    counterparty,
    counterpartyLabel,
  };
}
