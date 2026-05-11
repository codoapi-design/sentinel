/**
 * Webhook Store — CryptoBooks Enterprise
 *
 * Zustand store with persistence for managing webhook
 * endpoints and delivery logs. Supports adding, updating,
 * deleting endpoints, as well as testing and loading delivery logs.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WebhookEndpoint, WebhookDelivery, WebhookEvent } from '@/lib/webhooks/types';
import * as webhookService from '@/lib/webhooks/service';

// ============================================================
// State and Action Types
// ============================================================

interface WebhookState {
  /** List of webhook endpoints */
  webhooks: WebhookEndpoint[];
  /** Delivery logs per webhook (key = webhook ID) */
  deliveries: Record<string, WebhookDelivery[]>;
  /** Loading state */
  isLoading: boolean;
}

interface WebhookActions {
  /** Add a new webhook endpoint */
  addWebhook: (url: string, label: string, events: WebhookEvent[]) => void;
  /** Update a webhook endpoint */
  updateWebhook: (
    id: string,
    updates: Partial<Pick<WebhookEndpoint, 'url' | 'label' | 'events' | 'isActive'>>,
  ) => void;
  /** Delete a webhook endpoint */
  deleteWebhook: (id: string) => void;
  /** Test a webhook endpoint */
  testWebhook: (id: string) => Promise<WebhookDelivery | null>;
  /** Load delivery logs for an endpoint */
  loadDeliveries: (webhookId: string) => void;
  /** Toggle endpoint activation status */
  toggleWebhook: (id: string) => void;
  /** Refresh the list from service */
  refreshWebhooks: () => void;
}

// ============================================================
// Initial State
// ============================================================

const initialState: WebhookState = {
  webhooks: [],
  deliveries: {},
  isLoading: false,
};

// ============================================================
// Store
// ============================================================

export const useWebhookStore = create<WebhookState & WebhookActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Add Webhook ======
      addWebhook: (url: string, label: string, events: WebhookEvent[]) => {
        try {
          const webhook = webhookService.createWebhook(url, label, events);
          set(state => ({
            webhooks: [...state.webhooks, webhook],
          }));
        } catch (error) {
          console.error('Error creating webhook:', error);
          throw error;
        }
      },

      // ====== Update Webhook ======
      updateWebhook: (
        id: string,
        updates: Partial<Pick<WebhookEndpoint, 'url' | 'label' | 'events' | 'isActive'>>,
      ) => {
        try {
          const updated = webhookService.updateWebhook(id, updates);
          if (updated) {
            set(state => ({
              webhooks: state.webhooks.map(wh => (wh.id === id ? updated : wh)),
            }));
          }
        } catch (error) {
          console.error('Error updating webhook:', error);
          throw error;
        }
      },

      // ====== Delete Webhook ======
      deleteWebhook: (id: string) => {
        const deleted = webhookService.deleteWebhook(id);
        if (deleted) {
          set(state => {
            const newDeliveries = { ...state.deliveries };
            delete newDeliveries[id];
            return {
              webhooks: state.webhooks.filter(wh => wh.id !== id),
              deliveries: newDeliveries,
            };
          });
        }
      },

      // ====== Test Webhook ======
      testWebhook: async (id: string) => {
        set({ isLoading: true });
        try {
          const delivery = await webhookService.testWebhook(id);
          if (delivery) {
            set(state => ({
              deliveries: {
                ...state.deliveries,
                [id]: [delivery, ...(state.deliveries[id] || [])],
              },
              // Update webhook statistics
              webhooks: state.webhooks.map(wh => {
                if (wh.id === id) {
                  const updated = webhookService.getWebhook(id);
                  return updated || wh;
                }
                return wh;
              }),
            }));
          }
          return delivery;
        } catch (error) {
          console.error('Error testing webhook:', error);
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      // ====== Load Delivery Logs ======
      loadDeliveries: (webhookId: string) => {
        const deliveries = webhookService.getDeliveries(webhookId);
        set(state => ({
          deliveries: {
            ...state.deliveries,
            [webhookId]: deliveries,
          },
        }));
      },

      // ====== Toggle Activation Status ======
      toggleWebhook: (id: string) => {
        const webhook = get().webhooks.find(wh => wh.id === id);
        if (!webhook) return;

        const newIsActive = !webhook.isActive;
        const updated = webhookService.updateWebhook(id, { isActive: newIsActive });
        if (updated) {
          set(state => ({
            webhooks: state.webhooks.map(wh => (wh.id === id ? updated : wh)),
          }));
        }
      },

      // ====== Refresh List from Service ======
      refreshWebhooks: () => {
        const webhooks = webhookService.listWebhooks();
        set({ webhooks });
      },
    }),
    {
      name: 'cryptobooks_webhooks',
      // Partial persistence — don't save loading state
      partialize: (state) => ({
        webhooks: state.webhooks,
        deliveries: state.deliveries,
      }),
    },
  ),
);
