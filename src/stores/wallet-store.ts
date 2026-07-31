/**
 * Wallet Store - Zustand
 *
 * Manages wallet state: list of wallets, active wallet, loading states.
 * Handles local persistence + Supabase sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Transaction, type Client } from '@/lib/mock-data';
import { resolveOnChainActivity } from '@/lib/finance/activity';
import { resolveTypeLabel } from '@/lib/finance/summary';
import {
  assertAddressesAllowedForPlan,
  assertPlanAddressRequirements,
  filterAddressesByPlan,
  planAllowsAddressFamily,
} from '@/lib/plans/address-families';
import { PLAN_LIMITS as SHARED_PLAN_LIMITS } from '@/lib/plans/limits';

/** Migrate persisted wallet cache from previous brand key (once). */
if (typeof window !== 'undefined') {
  try {
    if (!localStorage.getItem('radareum-wallets')) {
      const legacy = localStorage.getItem('sentinel-wallets');
      if (legacy) {
        localStorage.setItem('radareum-wallets', legacy);
        localStorage.removeItem('sentinel-wallets');
      }
    }
  } catch {
    // ignore
  }
}

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

// Plan limits — aligned with pricing tiers (shared canonical source)
export const PLAN_LIMITS = {
  free: SHARED_PLAN_LIMITS.free,
  starter: SHARED_PLAN_LIMITS.starter,
  pro: SHARED_PLAN_LIMITS.pro,
  business: SHARED_PLAN_LIMITS.business,
  // DB / legacy alias for Business
  enterprise: SHARED_PLAN_LIMITS.business,
};

// Backward-compatible alias
export const PLAN_WALLET_LIMITS: Record<string, number> = {
  free: PLAN_LIMITS.free.wallets,
  starter: PLAN_LIMITS.starter.wallets,
  pro: PLAN_LIMITS.pro.wallets,
  business: PLAN_LIMITS.business.wallets,
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

  /** Auth user id that owns this cache — used to wipe cross-account localStorage bleed */
  ownerUserId: string | null;

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
  syncWallet: (
    walletId: string,
    mode?: 'full' | 'incremental' | 'auto',
  ) => Promise<{ success: boolean; error?: string; recordsSynced?: number }>;
  syncAllWallets: () => Promise<void>;
  loadWalletsFromDB: () => Promise<void>;
  /** Load transactions for a wallet from Supabase into the local store (UI source of truth). */
  loadTransactionsFromDB: (walletId: string) => Promise<Transaction[]>;
  /** Poll DB while a server-side Alchemy sync is in progress (new wallet add). */
  watchBackgroundSync: (walletId: string) => Promise<void>;
  /** Bind cache to auth user; clears local data when the user changes. */
  bindOwner: (userId: string | null) => void;

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
  currentPlan: 'starter',
  ownerUserId: null,
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

        try {
          const { useSubscriptionStore } = await import('@/stores/subscription-store');
          const subState = useSubscriptionStore.getState();
          if (subState.subscription) {
            const entitlement = subState.getEntitlement();
            if (!entitlement.entitled) {
              set({
                error:
                  entitlement.reason ||
                  'Your subscription has expired. Renew to add wallets.',
              });
              return;
            }
          }
        } catch {
          /* ignore */
        }

        const limit = PLAN_WALLET_LIMITS[state.currentPlan] ?? 1;
        if (Number.isFinite(limit) && state.wallets.length >= limit) {
          set({ error: `You have reached the wallet limit for your plan (${limit} wallets)` });
          return;
        }

        const label = input.label.trim();
        let evm = input.evmAddress?.trim() || '';
        let sol = input.solanaAddress?.trim() || '';
        let tron = input.tronAddress?.trim() || '';
        let btc = input.bitcoinAddress?.trim() || '';

        // Enforce plan address-family entitlements on the client
        const planCheck = assertAddressesAllowedForPlan(state.currentPlan, {
          evmAddress: evm,
          solanaAddress: sol,
          tronAddress: tron,
          bitcoinAddress: btc,
        });
        if (!planCheck.ok) {
          set({ error: planCheck.error });
          return;
        }

        const filtered = filterAddressesByPlan(state.currentPlan, {
          evmAddress: evm,
          solanaAddress: sol,
          tronAddress: tron,
          bitcoinAddress: btc,
        });
        evm = filtered.evmAddress || '';
        sol = filtered.solanaAddress || '';
        tron = filtered.tronAddress || '';
        btc = filtered.bitcoinAddress || '';

        if (!label) {
          set({ error: 'Please enter a wallet name' });
          return;
        }

        const req = assertPlanAddressRequirements(state.currentPlan, {
          evmAddress: evm,
          solanaAddress: sol,
          tronAddress: tron,
          bitcoinAddress: btc,
        });
        if (!req.ok) {
          set({ error: req.error });
          return;
        }

        // Drop any family the plan doesn't allow (defensive)
        if (!planAllowsAddressFamily(state.currentPlan, 'solana')) sol = '';
        if (!planAllowsAddressFamily(state.currentPlan, 'tron')) tron = '';
        if (!planAllowsAddressFamily(state.currentPlan, 'bitcoin')) btc = '';
        if (!planAllowsAddressFamily(state.currentPlan, 'evm')) evm = '';

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
          let hydratedFromCache = false;
          let clonedTxCount = 0;

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
              hydratedFromCache = result.hydratedFromCache === true;
              clonedTxCount = result.clone?.transactionsCopied || 0;
              console.log('[WalletStore] Wallet created in DB with ID:', walletId, {
                hydratedFromCache,
                clonedTxCount,
              });
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
            lastSyncedAt: created?.lastSyncedAt ?? null,
            isSyncing: true,
            transactionCount: clonedTxCount,
          };

          set(state => ({
            wallets: [...state.wallets, newWallet],
            activeWalletId: state.activeWalletId || walletId,
            isAddingWallet: false,
            isSyncing: { ...state.isSyncing, [walletId]: true },
            lastSyncAt: hydratedFromCache
              ? { ...state.lastSyncAt, [walletId]: Date.now() }
              : state.lastSyncAt,
          }));

          // Cloned addresses already have DB history — hydrate UI immediately,
          // then follow the background incremental Alchemy sync.
          if (hydratedFromCache) {
            try {
              await get().loadTransactionsFromDB(walletId);
            } catch {
              /* watchBackgroundSync will retry */
            }
          }

          // Server started full or incremental sync in the background.
          void get().watchBackgroundSync(walletId);
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
          // Align local plan + subscription period with server before sync loops run.
          try {
            const subRes = await fetch('/api/subscription');
            if (subRes.ok) {
              const subJson = await subRes.json();
              const { useSubscriptionStore } = await import('@/stores/subscription-store');
              const { toPricingTierId, toWalletPlanId } = await import(
                '@/lib/plans/entitlements'
              );
              if (subJson.subscription) {
                const existing = useSubscriptionStore.getState().subscription;
                const serverEnd = subJson.subscription.endDate;
                const entitled = Boolean(subJson.entitled);
                const pricingPlanId = toPricingTierId(subJson.subscription.planId);
                const planName =
                  subJson.subscription.planName ||
                  existing?.planName ||
                  pricingPlanId;
                useSubscriptionStore.getState().setSubscription({
                  planId: pricingPlanId,
                  planName,
                  billingPeriod: existing?.billingPeriod || 'monthly',
                  price: existing?.price ?? 0,
                  startDate:
                    subJson.subscription.startDate ||
                    existing?.startDate ||
                    new Date().toISOString(),
                  endDate: serverEnd,
                  txHash:
                    pricingPlanId === 'free'
                      ? 'free-trial'
                      : existing?.txHash || 'server',
                  paymentToken:
                    pricingPlanId === 'free' ? 'FREE' : existing?.paymentToken || 'USDC',
                  paymentChain:
                    pricingPlanId === 'free' ? 0 : existing?.paymentChain ?? 8453,
                  status: entitled ? 'active' : 'expired',
                  aiRequestsUsed: existing?.aiRequestsUsed ?? 0,
                  syncPausedAt: entitled
                    ? null
                    : existing?.syncPausedAt ?? new Date().toISOString(),
                });
                set({ currentPlan: toWalletPlanId(pricingPlanId) });
              } else {
                useSubscriptionStore.getState().clearSubscription();
                useSubscriptionStore.getState().markServerHydrated();
              }
            }
          } catch {
            /* local subscription store remains the fallback */
          }

          const response = await fetch('/api/wallets');
          if (response.ok) {
            const result = await response.json();
            // Subscription is authoritative. wallets.plan is only a fallback.
            const { useSubscriptionStore } = await import('@/stores/subscription-store');
            const subPlan = useSubscriptionStore.getState().subscription?.planId;
            if (subPlan) {
              const { toWalletPlanId } = await import('@/lib/plans/entitlements');
              set({ currentPlan: toWalletPlanId(subPlan) });
            } else if (result.plan) {
              set({ currentPlan: result.plan });
            }

            // DB is the only source of truth per authenticated user.
            // Never keep orphan localStorage wallets from a previous account.
            const dbWallets: WalletInfo[] = (result.data || []).map((w: any) => ({
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

            const ownedIds = new Set(dbWallets.map(w => w.id));

            set(state => {
              const pruneMap = <T,>(map: Record<string, T>): Record<string, T> => {
                const next: Record<string, T> = {};
                for (const [id, value] of Object.entries(map)) {
                  if (ownedIds.has(id)) next[id] = value;
                }
                return next;
              };

              const activeId =
                state.activeWalletId && ownedIds.has(state.activeWalletId)
                  ? state.activeWalletId
                  : dbWallets[0]?.id || null;

              return {
                wallets: dbWallets,
                activeWalletId: activeId,
                transactionsMap: pruneMap(state.transactionsMap),
                clientsMap: pruneMap(state.clientsMap),
                isSyncing: pruneMap(state.isSyncing),
                lastSyncAt: pruneMap(state.lastSyncAt),
                isLoadingWallets: false,
              };
            });
          } else {
            // Unauthorized / error — do not keep previous account cache
            set({
              ...initialState,
              isLoadingWallets: false,
              error: 'Failed to load wallets',
            });
          }
        } catch (err) {
          console.warn('[WalletStore] Failed to load wallets from DB:', err);
          set({ isLoadingWallets: false });
        }
      },

      // ====== Data Operations ======

      /**
       * Load transactions from Supabase into Zustand.
       * Pages through the full plan-allowed history (no hard 500 cap for Business/Pro).
       */
      loadTransactionsFromDB: async (walletId: string) => {
        try {
          const all: Transaction[] = [];
          let offset = 0;
          const pageSize = 1000;
          let guard = 0;

          while (guard++ < 100) {
            const response = await fetch(
              `/api/wallets/${walletId}/transactions?limit=${pageSize}&offset=${offset}`,
            );
            if (!response.ok) {
              console.warn('[WalletStore] DB transactions fetch failed:', response.status);
              if (offset === 0) {
                set(state => {
                  const transactionsMap = { ...state.transactionsMap };
                  const clientsMap = { ...state.clientsMap };
                  delete transactionsMap[walletId];
                  delete clientsMap[walletId];
                  return { transactionsMap, clientsMap };
                });
                return [];
              }
              break;
            }
            const result = await response.json();
            const batch: Transaction[] = result.data || [];
            all.push(...batch);

            const planLimit =
              typeof result.planLimit === 'number' && Number.isFinite(result.planLimit)
                ? result.planLimit
                : null;
            if (planLimit != null && all.length >= planLimit) {
              all.length = planLimit;
              break;
            }
            if (!result.hasMore || batch.length === 0) break;
            offset += pageSize;
          }

          get().setTransactions(walletId, all);

          set(state => ({
            wallets: state.wallets.map(w =>
              w.id === walletId
                ? { ...w, transactionCount: all.length }
                : w
            ),
          }));

          return all;
        } catch (err) {
          console.warn('[WalletStore] DB transactions fetch error:', err);
          return [];
        }
      },

      /**
       * Follow a server-started Alchemy fullSync without issuing a second sync.
       * Reloads wallets + transactions from DB so the UI fills in as data lands.
       */
      watchBackgroundSync: async (walletId: string) => {
        const started = Date.now();
        const maxMs = 5 * 60 * 1000;
        let sawSyncing = false;
        let lastTxCount = 0;

        set(state => ({
          isSyncing: { ...state.isSyncing, [walletId]: true },
          wallets: state.wallets.map(w =>
            w.id === walletId ? { ...w, isSyncing: true } : w,
          ),
        }));

        while (Date.now() - started < maxMs) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            await get().loadWalletsFromDB();
            await get().loadTransactionsFromDB(walletId);
          } catch {
            /* keep polling */
          }

          const wallet = get().wallets.find(w => w.id === walletId);
          if (!wallet) break;
          if (wallet.isSyncing) sawSyncing = true;

          // Nudge portfolio hooks whenever new rows land in the DB.
          const txCount = wallet.transactionCount || 0;
          if (txCount !== lastTxCount) {
            lastTxCount = txCount;
            set(state => ({
              lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
            }));
          }

          if (sawSyncing && !wallet.isSyncing) break;
          if (!wallet.isSyncing && (txCount > 0 || wallet.lastSyncedAt)) {
            if (Date.now() - started > 8_000) break;
          }
        }

        try {
          await get().loadWalletsFromDB();
          await get().loadTransactionsFromDB(walletId);
        } catch {
          /* ignore */
        }

        set(state => ({
          isSyncing: { ...state.isSyncing, [walletId]: false },
          wallets: state.wallets.map(w =>
            w.id === walletId ? { ...w, isSyncing: false } : w,
          ),
          lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
        }));
      },

      /**
       * Sync wallet data from blockchain providers INTO the database.
       * After sync, the local store is refreshed from the DB only.
       *
       * Modes:
       *   - full: complete historical ingest + balances (user Sync button)
       *   - incremental: only new txs since last block + refreshed balances
       *   - auto (default): full if never synced, else incremental
       */
      syncWallet: async (walletId: string, mode: 'full' | 'incremental' | 'auto' = 'auto') => {
        // Soft client gate — authoritative check lives on the sync API.
        try {
          const { useSubscriptionStore } = await import('@/stores/subscription-store');
          const subState = useSubscriptionStore.getState();
          if (subState.subscription) {
            const entitlement = subState.getEntitlement();
            if (!entitlement.entitled) {
              try {
                const { useUpgradePromptStore } = await import('@/stores/upgrade-prompt-store');
                useUpgradePromptStore.getState().openUpgradePrompt(entitlement.reason || undefined);
              } catch {
                /* ignore */
              }
              return {
                success: false,
                error: entitlement.reason || 'Subscription expired. Renew to resume sync.',
              };
            }
          }
        } catch {
          /* store may be unavailable in non-browser contexts */
        }

        const state = get();
        let wallet = state.wallets.find(w => w.id === walletId);
        if (!wallet || wallet.isSyncing) {
          return { success: false, error: wallet?.isSyncing ? 'Wallet is already syncing' : 'Wallet not found' };
        }

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
            return { success: false, error: 'Cannot resolve wallet. Try removing and re-adding it.' };
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

        const clearSyncing = (extra?: { error?: string | null }) => {
          set(state => ({
            isSyncing: { ...state.isSyncing, [walletId]: false },
            wallets: state.wallets.map(w =>
              w.id === walletId ? { ...w, isSyncing: false } : w
            ),
            ...(extra?.error !== undefined ? { error: extra.error } : {}),
          }));
        };

        try {
          // 1) Alchemy → DB (balances + transfers); CoinGecko fills historical price gaps
          const syncResponse = await fetch(`/api/wallets/${walletId}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: resolvedMode }),
          });

          const syncResult = await syncResponse.json().catch(() => ({} as Record<string, unknown>));

          if (!syncResponse.ok) {
            const rawError =
              (typeof syncResult.error === 'string' && syncResult.error) ||
              `Sync failed (${syncResponse.status})`;
            const errorMessage =
              syncResponse.status === 429 || /rate.?limit/i.test(rawError)
                ? 'Provider rate limit reached. Please wait a minute and try again.'
                : syncResponse.status === 402
                  ? rawError
                : syncResponse.status === 409
                  ? 'Wallet is already syncing. Please wait for it to finish.'
                  : rawError;

            console.warn('[WalletStore] Sync endpoint returned:', syncResponse.status, errorMessage);
            clearSyncing({ error: errorMessage });
            return { success: false, error: errorMessage };
          }

          const recordsSynced =
            typeof syncResult.totalRecordsSynced === 'number'
              ? syncResult.totalRecordsSynced
              : 0;

          console.log('[WalletStore] Sync completed:', {
            mode: resolvedMode,
            success: syncResult.success,
            changed: syncResult.changed,
            recordsSynced,
          });

          // Soft-fail: API returned 200 but providers reported failure (e.g. rate limits)
          if (syncResult.success === false) {
            const providerErrors = Array.isArray(syncResult.results)
              ? syncResult.results
                  .flatMap((r: { errors?: string[] }) => r.errors || [])
                  .filter(Boolean)
              : [];
            const joined = providerErrors.join('; ');
            const errorMessage =
              /rate.?limit/i.test(joined)
                ? 'Provider rate limit reached. Please wait a minute and try again.'
                : joined || 'Sync completed with errors from blockchain providers.';

            // Still refresh UI from DB — partial data may have been upserted
            const transactions = await get().loadTransactionsFromDB(walletId);
            set(state => ({
              wallets: state.wallets.map(w =>
                w.id === walletId
                  ? {
                      ...w,
                      isSyncing: false,
                      lastSyncedAt: new Date().toISOString(),
                      transactionCount: transactions.length,
                    }
                  : w
              ),
              isSyncing: { ...state.isSyncing, [walletId]: false },
              lastSyncAt: { ...state.lastSyncAt, [walletId]: Date.now() },
              error: errorMessage,
            }));
            return { success: false, error: errorMessage, recordsSynced };
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
            error: null,
          }));

          return { success: true, recordsSynced };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to sync wallet';
          clearSyncing({ error: errorMessage });
          return { success: false, error: errorMessage };
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
        if (!Number.isFinite(limit)) return true;
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
        // Normalize labels for English-only UI (legacy cached rows may lack activity)
        const normalized = transactions.map(tx => ({
          ...tx,
          typeLabel:
            tx.typeLabel && !/[\u0600-\u06FF]/.test(tx.typeLabel)
              ? tx.typeLabel
              : resolveTypeLabel(tx.type),
          activity:
            tx.activity ||
            resolveOnChainActivity({
              direction: tx.direction,
              methodName: tx.methodName,
              type: tx.type,
            }),
        }));

        set(state => {
          const existing = state.clientsMap[walletId] || [];
          const existingByKey = new Map(
            existing.map(c => [(c.address || '').toLowerCase(), c]),
          );

          // Rebuild counterparties from txs, but preserve existing custom names
          const clientMap = new Map<string, Client>();
          for (const tx of normalized) {
            const key = (tx.counterparty || '').toLowerCase();
            if (!key || !key.startsWith('0x')) continue;
            if (clientMap.has(key)) continue;

            const prev = existingByKey.get(key);
            if (prev) {
              // Keep prior client entry (custom name, notes, color, id)
              clientMap.set(key, prev);
              continue;
            }

            // Auto-label unnamed addresses only
            clientMap.set(key, {
              id: `client-auto-${key.slice(2, 8)}`,
              name: tx.counterpartyLabel || `${key.slice(0, 6)}...${key.slice(-4)}`,
              address: tx.counterparty,
              notes: '',
              color: '#8a8f98',
              createdAt: new Date().toISOString().split('T')[0],
            });
          }

          // Retain user-defined clients that are not in the current tx set
          for (const [key, client] of existingByKey) {
            if (clientMap.has(key)) continue;
            if (
              client.id.startsWith('client-auto-') ||
              client.id.startsWith('addr-')
            ) {
              continue;
            }
            clientMap.set(key, client);
          }

          return {
            transactionsMap: { ...state.transactionsMap, [walletId]: normalized },
            clientsMap: {
              ...state.clientsMap,
              [walletId]: Array.from(clientMap.values()),
            },
          };
        });
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

      bindOwner: (userId: string | null) => {
        const prev = get().ownerUserId;
        if (prev === userId) return;
        // Different account (or logout) — drop every cached wallet/list
        set({
          ...initialState,
          ownerUserId: userId,
        });
        try {
          localStorage.removeItem('radareum-wallets');
          localStorage.removeItem('sentinel-wallets');
          localStorage.removeItem('cryptobooks-wallets');
        } catch {
          // ignore
        }
      },

      reset: () => {
        set(initialState);
        try {
          localStorage.removeItem('radareum-wallets');
          localStorage.removeItem('sentinel-wallets');
          localStorage.removeItem('cryptobooks-wallets');
        } catch {
          // ignore
        }
      },
    }),
    {
      name: 'radareum-wallets',
      partialize: (state) => ({
        wallets: state.wallets,
        activeWalletId: state.activeWalletId,
        transactionsMap: state.transactionsMap,
        clientsMap: state.clientsMap,
        currentPlan: state.currentPlan,
        ownerUserId: state.ownerUserId,
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

