/**
 * API Key Store — CryptoBooks Enterprise
 *
 * Zustand store with persistence for managing API keys.
 * Masks keys in storage and only reveals the full key
 * upon creation. Supports creating, revoking, and
 * loading usage statistics.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ApiKey, ApiKeyPermission, ApiUsageStats } from '@/lib/api-keys/types';
import * as apiKeyService from '@/lib/api-keys/service';

// ============================================================
// State and Action Types
// ============================================================

interface ApiKeyState {
  /** List of API keys (keys are masked) */
  apiKeys: ApiKey[];
  /** Overall usage statistics */
  usageStats: ApiUsageStats | null;
  /** Loading state */
  isLoading: boolean;
  /** Full key of the last created key (shown once) */
  lastCreatedKey: string | null;
}

interface ApiKeyActions {
  /** Create a new API key */
  createKey: (name: string, permissions: ApiKeyPermission[], rateLimit?: number) => ApiKey;
  /** Revoke (disable) an API key */
  revokeKey: (id: string) => void;
  /** Toggle API key activation status */
  toggleKey: (id: string) => void;
  /** Load usage statistics */
  loadUsageStats: () => void;
  /** Clear the last created key after viewing */
  clearLastCreatedKey: () => void;
  /** Refresh the list from service */
  refreshKeys: () => void;
}

// ============================================================
// Initial State
// ============================================================

const initialState: ApiKeyState = {
  apiKeys: [],
  usageStats: null,
  isLoading: false,
  lastCreatedKey: null,
};

// ============================================================
// Store
// ============================================================

export const useApiKeyStore = create<ApiKeyState & ApiKeyActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Create New Key ======
      createKey: (name: string, permissions: ApiKeyPermission[], rateLimit?: number) => {
        try {
          const apiKey = apiKeyService.generateApiKey(
            name,
            permissions,
            rateLimit,
          );

          // Save the full key to show once
          set(state => ({
            apiKeys: [...state.apiKeys, apiKey],
            lastCreatedKey: apiKey.key,
          }));

          return apiKey;
        } catch (error) {
          console.error('Error creating API key:', error);
          throw error;
        }
      },

      // ====== Revoke Key ======
      revokeKey: (id: string) => {
        const revoked = apiKeyService.revokeApiKey(id);
        if (revoked) {
          set(state => ({
            apiKeys: state.apiKeys.map(key =>
              key.id === id ? { ...key, isActive: false } : key,
            ),
          }));
        }
      },

      // ====== Toggle Activation Status ======
      toggleKey: (id: string) => {
        const apiKey = get().apiKeys.find(k => k.id === id);
        if (!apiKey) return;

        if (apiKey.isActive) {
          apiKeyService.revokeApiKey(id);
          set(state => ({
            apiKeys: state.apiKeys.map(key =>
              key.id === id ? { ...key, isActive: false } : key,
            ),
          }));
        } else {
          apiKeyService.activateApiKey(id);
          set(state => ({
            apiKeys: state.apiKeys.map(key =>
              key.id === id ? { ...key, isActive: true } : key,
            ),
          }));
        }
      },

      // ====== Load Usage Statistics ======
      loadUsageStats: () => {
        set({ isLoading: true });
        try {
          const stats = apiKeyService.getApiUsageStats();
          set({ usageStats: stats });
        } catch (error) {
          console.error('Error loading usage statistics:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      // ====== Clear Last Key ======
      clearLastCreatedKey: () => {
        set({ lastCreatedKey: null });
      },

      // ====== Refresh List ======
      refreshKeys: () => {
        const apiKeys = apiKeyService.listApiKeys();
        set({ apiKeys });
      },
    }),
    {
      name: 'cryptobooks_api_keys',
      // Partial persistence — don't save loading state or last key
      partialize: (state) => ({
        apiKeys: state.apiKeys.map(key => ({
          ...key,
          // Mask the key in persistent storage
          key: apiKeyService.maskApiKey(key.key),
        })),
        usageStats: state.usageStats,
      }),
    },
  ),
);
