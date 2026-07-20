/**
 * Wallet Store - Zustand
 *
 * Manages wallet state: list of wallets, active wallet, loading states.
 * Handles local persistence + Supabase sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Transaction, type Client } from '@/lib/mock-data';

// ============================================================
// Types
// ============================================================

export interface WalletInfo {
  id: string;
  /** EVM address (nullable when wallet is non-EVM only) */
  address: string | null;
  solanaAddress: string | null;
  tronAddress: string | null;
  bitcoinAddress: string | null;
  /** Primary address for display (EVM → Solana → Tron → Bitcoin) */
  displayAddress: string;
  label: string;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  transactionCount: number;
}

export interface AddWalletInput {
  label: string;
  evmAddress?: string;
  solanaAddress?: string;
  tronAddress?: string;
  bitcoinAddress?: string;
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
  addWallet: (input: AddWalletInput) => Promise<void>;
  removeWallet: (walletId: string) => Promise<void>;
  setActiveWallet: (walletId: string) => void;
  updateWalletLabel: (walletId: string, label: string) => Promise<void>;

  // Data operations
  /** Sync providers → DB. mode 'auto' = full if never synced, else incremental. */
  syncWallet: (walletId: string, mode?: 'full' | 'incremental' | 'auto') => Promise<void>;
  syncAllWallets: () => Promise<void>;
  loadWalletsFromDB: () => Promise<void>;
  /** Load transactions for a wallet from Supabase into the local store (UI source of truth). */
  loadTransactionsFromDB: (walletId: string) => Promise<Transaction[]>;

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

export const useWalletStore = create<WalletState & WalletActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Wallet CRUD ======

      addWallet: async (input: AddWalletInput) => {
        const state = get();

        const limit = PLAN_WALLET_LIMITS[state.currentPlan] ?? 1;
        if (state.wallets.length >= limit) {
          set({ error: `You have reached the wallet limit for your plan (${limit} wallets)` });
          return;
        }

        const label = input.label.trim();
        const evm = input.evmAddress?.trim() || '';
        const sol = input.solanaAddress?.trim() || '';
        const tron = input.tronAddress?.trim() || '';
        const btc = input.bitcoinAddress?.trim() || '';

        if (!label) {
          set({ error: 'Please enter a wallet name' });
          return;
        }
        if (!evm && !sol && !tron && !btc) {
          set({ error: 'Enter at least one address (EVM, Solana, Tron, or Bitcoin)' });
          return;
        }

        const matchesAny = (w: WalletInfo) =>
          (evm && w.address?.toLowerCase() === evm.toLowerCase()) ||
          (sol && w.solanaAddress === sol) ||
          (tron && w.tronAddress === tron) ||
          (btc && w.bitcoinAddress === btc);

        if (state.wallets.some(matchesAny)) {
          set({ error: 'This wallet address is already added' });
          return;
        }

        set({ isAddingWallet: true, error: null });

        try {
          let walletId: string | null = null;
          let created: Partial<WalletInfo> | null = null;

          try {
            const response = await fetch('/api/wallets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                label,
                evmAddress: evm || undefined,
                solanaAddress: sol || undefined,
                tronAddress: tron || undefined,
                bitcoinAddress: btc || undefined,
                // backward compat
                address: evm || undefined,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              walletId = result.data?.id || null;
              created = result.data;
              console.log('[WalletStore] Wallet created in DB with ID:', walletId);
            } else {
              const errData = await response.json().catch(() => ({}));
              console.error('[WalletStore] Failed to add wallet to DB:', errData.error);
              set({
                isAddingWallet: false,
                error: `Failed to create wallet: ${errData.error || 'Server error'}`,
              });
              return;
            }
          } catch (err) {
            console.error('[WalletStore] Supabase not available:', err);
            set({
              isAddingWallet: false,
              error: 'Cannot connect to server. Please try again.',
            });
            return;
          }

          if (!walletId) {
            set({
              isAddingWallet: false,
              error: 'Failed to create wallet: no ID returned from server',
            });
            return;
          }

          const newWallet: WalletInfo = {
            id: walletId,
            address: created?.address ?? (evm ? evm.toLowerCase() : null),
            solanaAddress: created?.solanaAddress ?? (sol || null),
            tronAddress: created?.tronAddress ?? (tron || null),
            bitcoinAddress: created?.bitcoinAddress ?? (btc || null),
            displayAddress:
              created?.displayAddress ||
              evm ||
              sol ||
              tron ||
              btc,
            label,
            lastSyncedAt: null,
            isSyncing: false,
            transactionCount: 0,
          };

          set(state => ({
            wallets: [...state.wallets, newWallet],
            activeWalletId: state.activeWalletId || walletId,
            isAddingWallet: false,
          }));

          get().syncWallet(walletId, 'full');
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
        // Hydrate UI from DB immediately when switching wallets
        void get().loadTransactionsFromDB(walletId);
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
        set({ isLoadingWallets: true });
        try {
          const response = await fetch('/api/wallets');
          if (response.ok) {
            const result = await response.json();
            if (result.data && result.data.length > 0) {
              const dbWallets: WalletInfo[] = result.data.map((w: any) => ({
                id: w.id,
                address: w.address ?? null,
                solanaAddress: w.solanaAddress ?? w.solana_address ?? null,
                tronAddress: w.tronAddress ?? w.tron_address ?? null,
                bitcoinAddress: w.bitcoinAddress ?? w.bitcoin_address ?? null,
                displayAddress:
                  w.displayAddress ||
                  w.address ||
                  w.solanaAddress ||
                  w.solana_address ||
                  w.tronAddress ||
                  w.tron_address ||
                  w.bitcoinAddress ||
                  w.bitcoin_address ||
                  '',
                label: w.label,
                lastSyncedAt: w.lastSyncedAt || w.last_synced_at,
                isSyncing: false,
                transactionCount: 0,
              }));

              set(state => {
                // Prefer matching by wallet id; fall back to any shared address family
                const dbById = new Map(dbWallets.map(w => [w.id, w]));
                const idMigrations: Map<string, string> = new Map();
                const merged: WalletInfo[] = [];
                const usedDbIds = new Set<string>();

                const findDbMatch = (localW: WalletInfo) => {
                  const byId = dbById.get(localW.id);
                  if (byId) return byId;
                  return dbWallets.find(
                    db =>
                      (localW.address &&
                        db.address &&
                        localW.address.toLowerCase() === db.address.toLowerCase()) ||
                      (localW.solanaAddress && localW.solanaAddress === db.solanaAddress) ||
                      (localW.tronAddress && localW.tronAddress === db.tronAddress) ||
                      (localW.bitcoinAddress && localW.bitcoinAddress === db.bitcoinAddress),
                  );
                };

                for (const localW of state.wallets) {
                  const dbMatch = findDbMatch(localW);
                  if (dbMatch) {
                    const reconciled: WalletInfo = {
                      ...dbMatch,
                      lastSyncedAt: localW.lastSyncedAt || dbMatch.lastSyncedAt,
                    };
                    merged.push(reconciled);
                    usedDbIds.add(dbMatch.id);
                    if (localW.id !== dbMatch.id) {
                      console.log(`[WalletStore] Reconciling wallet ${localW.id} -> ${dbMatch.id}`);
                      idMigrations.set(localW.id, dbMatch.id);
                    }
                  } else if (localW.id.includes('-') && localW.id.length >= 32) {
                    // Normalize legacy local wallets that only had `address`
                    merged.push({
                      ...localW,
                      solanaAddress: localW.solanaAddress ?? null,
                      tronAddress: localW.tronAddress ?? null,
                      bitcoinAddress: localW.bitcoinAddress ?? null,
                      displayAddress:
                        localW.displayAddress ||
                        localW.address ||
                        localW.solanaAddress ||
                        localW.tronAddress ||
                        localW.bitcoinAddress ||
                        '',
                    });
                  }
                }

                for (const dbW of dbWallets) {
                  if (!usedDbIds.has(dbW.id) && !merged.some(m => m.id === dbW.id)) {
                    merged.push(dbW);
                  }
                }

                let activeId = state.activeWalletId;
                if (activeId) {
                  const activeInMerged = merged.find(w => w.id === activeId);
                  if (!activeInMerged) {
                    const oldWallet = state.wallets.find(w => w.id === activeId);
                    if (oldWallet) {
                      const replacement = findDbMatch(oldWallet);
                      activeId = replacement?.id || merged[0]?.id || null;
                    } else {
                      activeId = merged[0]?.id || null;
                    }
                  }
                }

                // Migrate transactionsMap and clientsMap keys from old IDs to new IDs
                const newTransactionsMap = { ...state.transactionsMap };
                const newClientsMap = { ...state.clientsMap };
                const newSyncing = { ...state.isSyncing };
                const newLastSync = { ...state.lastSyncAt };

                for (const [oldId, newId] of idMigrations) {
                  if (newTransactionsMap[oldId] !== undefined) {
                    newTransactionsMap[newId] = newTransactionsMap[oldId];
                    delete newTransactionsMap[oldId];
                  }
                  if (newClientsMap[oldId] !== undefined) {
                    newClientsMap[newId] = newClientsMap[oldId];
                    delete newClientsMap[oldId];
                  }
                  if (newSyncing[oldId] !== undefined) {
                    newSyncing[newId] = newSyncing[oldId];
                    delete newSyncing[oldId];
                  }
                  if (newLastSync[oldId] !== undefined) {
                    newLastSync[newId] = newLastSync[oldId];
                    delete newLastSync[oldId];
                  }
                }

                return {
                  wallets: merged,
                  activeWalletId: activeId || merged[0]?.id,
                  transactionsMap: newTransactionsMap,
                  clientsMap: newClientsMap,
                  isSyncing: newSyncing,
                  lastSyncAt: newLastSync,
                  isLoadingWallets: false,
                };
              });
            }
          }
          set({ isLoadingWallets: false });
        } catch (err) {
          console.warn('[WalletStore] Failed to load wallets from DB:', err);
          set({ isLoadingWallets: false });
        }
      },

      // ====== Data Operations ======

      /**
       * Load transactions from Supabase into Zustand.
       * This is the ONLY source the UI should display — never live provider APIs.
       */
      loadTransactionsFromDB: async (walletId: string) => {
        try {
          const response = await fetch(`/api/wallets/${walletId}/transactions`);
          if (!response.ok) {
            console.warn('[WalletStore] DB transactions fetch failed:', response.status);
            return get().transactionsMap[walletId] || [];
          }
          const result = await response.json();
          const transactions: Transaction[] = result.data || [];
          get().setTransactions(walletId, transactions);

          set(state => ({
            wallets: state.wallets.map(w =>
              w.id === walletId
                ? { ...w, transactionCount: transactions.length }
                : w
            ),
          }));

          return transactions;
        } catch (err) {
          console.warn('[WalletStore] DB transactions fetch error:', err);
          return get().transactionsMap[walletId] || [];
        }
      },

      /**
       * Sync wallet data from blockchain providers INTO the database.
       * After sync, the local store is refreshed from the DB only.
       *
       * Modes:
       *   - full: first-time / forced complete ingest
       *   - incremental: only new txs + refreshed balances
       *   - auto (default): full if never synced, else incremental
       */
      syncWallet: async (walletId: string, mode: 'full' | 'incremental' | 'auto' = 'auto') => {
        const state = get();
        let wallet = state.wallets.find(w => w.id === walletId);
        if (!wallet || wallet.isSyncing) return;

        // Validate wallet ID is a proper DB UUID (not a stale wallet-XXXXX ID)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(walletId);
        if (!isUUID) {
          console.warn('[WalletStore] Wallet ID is not a valid UUID, attempting to resolve from DB...');
          await get().loadWalletsFromDB();
          const updatedState = get();
          const resolvedWallet = updatedState.wallets.find(
            w =>
              (wallet!.address &&
                w.address &&
                w.address.toLowerCase() === wallet!.address.toLowerCase()) ||
              (wallet!.solanaAddress && w.solanaAddress === wallet!.solanaAddress) ||
              (wallet!.tronAddress && w.tronAddress === wallet!.tronAddress) ||
              (wallet!.bitcoinAddress && w.bitcoinAddress === wallet!.bitcoinAddress) ||
              w.displayAddress === wallet!.displayAddress,
          );
          if (resolvedWallet && resolvedWallet.id !== walletId) {
            console.log(`[WalletStore] Resolved wallet ID: ${walletId} -> ${resolvedWallet.id}`);
            walletId = resolvedWallet.id;
            wallet = resolvedWallet;
          } else {
            console.error('[WalletStore] Cannot resolve wallet UUID. Skipping sync.');
            return;
          }
        }

        const resolvedMode: 'full' | 'incremental' =
          mode === 'auto'
            ? (wallet.lastSyncedAt ? 'incremental' : 'full')
            : mode;

        set(state => ({
          isSyncing: { ...state.isSyncing, [walletId]: true },
          error: null,
          wallets: state.wallets.map(w =>
            w.id === walletId ? { ...w, isSyncing: true } : w
          ),
        }));

        try {
          // 1) Providers → DB (only path that talks to Etherscan/CoinGecko)
          try {
            const syncResponse = await fetch(`/api/wallets/${walletId}/sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: resolvedMode }),
            });
            if (syncResponse.ok) {
              const syncResult = await syncResponse.json();
              console.log('[WalletStore] Sync completed:', {
                mode: resolvedMode,
                success: syncResult.success,
                changed: syncResult.changed,
                recordsSynced: syncResult.totalRecordsSynced,
              });
            } else {
              const errData = await syncResponse.json().catch(() => ({}));
              console.warn('[WalletStore] Sync endpoint returned:', syncResponse.status, errData.error || '');
            }
          } catch (syncError) {
            console.warn('[WalletStore] Sync endpoint error:', syncError);
          }

          // 2) DB → local store (UI source of truth)
          const transactions = await get().loadTransactionsFromDB(walletId);
          const txCount = transactions.length;

          set(state => ({
            wallets: state.wallets.map(w =>
              w.id === walletId
                ? {
                    ...w,
                    isSyncing: false,
                    lastSyncedAt: new Date().toISOString(),
                    transactionCount: txCount,
                  }
                : w
            ),
            isSyncing: { ...state.isSyncing, [walletId]: false },
            lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
          }));
        } catch (error) {
          set(state => ({
            isSyncing: { ...state.isSyncing, [walletId]: false },
            wallets: state.wallets.map(w =>
              w.id === walletId ? { ...w, isSyncing: false } : w
            ),
            error: error instanceof Error ? error.message : 'Failed to sync wallet',
          }));
        }
      },

      syncAllWallets: async () => {
        const state = get();
        for (const wallet of state.wallets) {
          if (!state.isSyncing[wallet.id]) {
            await get().syncWallet(wallet.id, 'auto');
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
        const needle = address.toLowerCase();
        return (
          get().wallets.find(
            w =>
              w.address?.toLowerCase() === needle ||
              w.solanaAddress?.toLowerCase() === needle ||
              w.tronAddress?.toLowerCase() === needle ||
              w.bitcoinAddress?.toLowerCase() === needle ||
              w.displayAddress?.toLowerCase() === needle,
          ) || null
        );
      },

      // ====== Setters ======

      setTransactions: (walletId: string, transactions: Transaction[]) => {
        // Derive counterparties as clients so UI sections stay consistent
        const clientMap = new Map<string, Client>();
        for (const tx of transactions) {
          const key = (tx.counterparty || '').toLowerCase();
          if (!key || !key.startsWith('0x')) continue;
          if (!clientMap.has(key)) {
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

        set(state => ({
          transactionsMap: { ...state.transactionsMap, [walletId]: transactions },
          clientsMap: { ...state.clientsMap, [walletId]: Array.from(clientMap.values()) },
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
      // Migrate stale wallet IDs on rehydration from localStorage
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<WalletState>;
        if (!persisted?.wallets) return currentState;

        // Find stale wallet-XXXXX IDs and remove them
        const staleIds = new Set<string>();
        const validWallets = (persisted.wallets || []).filter(w => {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w.id);
          if (!isUUID) {
            staleIds.add(w.id);
            return false;
          }
          return true;
        });

        if (staleIds.size > 0) {
          console.log(`[WalletStore] Migrating ${staleIds.size} stale wallet IDs from localStorage`);

          // Clean up transactionsMap, clientsMap keys for stale IDs
          const cleanTransactionsMap = { ...(persisted.transactionsMap || {}) };
          const cleanClientsMap = { ...(persisted.clientsMap || {}) };
          const cleanLastSyncAt = { ...(persisted.lastSyncAt || {}) };

          for (const staleId of staleIds) {
            delete cleanTransactionsMap[staleId];
            delete cleanClientsMap[staleId];
            delete cleanLastSyncAt[staleId];
          }

          // Fix activeWalletId if it was stale
          let activeId: string | null = persisted.activeWalletId || null;
          if (activeId && staleIds.has(activeId)) {
            activeId = validWallets[0]?.id || null;
          }

          return {
            ...currentState,
            ...persisted,
            wallets: validWallets,
            activeWalletId: activeId,
            transactionsMap: cleanTransactionsMap,
            clientsMap: cleanClientsMap,
            lastSyncAt: cleanLastSyncAt,
          };
        }

        return { ...currentState, ...persisted };
      },
    }
  )
);

