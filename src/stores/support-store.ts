/**
 * Support Ticket Store — CryptoBooks Enterprise
 *
 * Zustand store with persistence for managing support tickets
 * and dedicated accountants. Supports creating, updating tickets,
 * adding messages, closing tickets, and submitting satisfaction ratings.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SupportTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  DedicatedAccountant,
} from '@/lib/support/types';
import * as supportService from '@/lib/support/service';

// ============================================================
// State and Action Types
// ============================================================

interface SupportState {
  /** List of support tickets */
  tickets: SupportTicket[];
  /** Dedicated accountant */
  dedicatedAccountant: DedicatedAccountant | null;
  /** Loading state */
  isLoading: boolean;
}

interface SupportActions {
  /** Create a new ticket */
  createTicket: (
    subject: string,
    description: string,
    category: TicketCategory,
    priority: TicketPriority,
  ) => SupportTicket;
  /** Update a ticket */
  updateTicket: (
    id: string,
    updates: Partial<Pick<SupportTicket, 'subject' | 'category' | 'priority' | 'status'>>,
  ) => void;
  /** Add a message to a ticket */
  addMessage: (
    ticketId: string,
    content: string,
    sender: 'user' | 'support' | 'accountant',
  ) => void;
  /** Close a ticket */
  closeTicket: (id: string) => void;
  /** Submit a satisfaction rating */
  rateTicket: (ticketId: string, rating: number) => void;
  /** Load dedicated accountant data */
  loadAccountant: () => void;
  /** Refresh the list from service */
  refreshTickets: () => void;
}

// ============================================================
// Initial State
// ============================================================

const initialState: SupportState = {
  tickets: [],
  dedicatedAccountant: null,
  isLoading: false,
};

// ============================================================
// Store
// ============================================================

export const useSupportStore = create<SupportState & SupportActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Create Ticket ======
      createTicket: (
        subject: string,
        description: string,
        category: TicketCategory,
        priority: TicketPriority,
      ) => {
        try {
          const ticket = supportService.createTicket(subject, description, category, priority);
          set(state => ({
            tickets: [ticket, ...state.tickets],
          }));
          return ticket;
        } catch (error) {
          console.error('Error creating ticket:', error);
          throw error;
        }
      },

      // ====== Update Ticket ======
      updateTicket: (
        id: string,
        updates: Partial<Pick<SupportTicket, 'subject' | 'category' | 'priority' | 'status'>>,
      ) => {
        const updated = supportService.updateTicket(id, updates);
        if (updated) {
          set(state => ({
            tickets: state.tickets.map(t => (t.id === id ? updated : t)),
          }));
        }
      },

      // ====== Add Message ======
      addMessage: (
        ticketId: string,
        content: string,
        sender: 'user' | 'support' | 'accountant',
      ) => {
        const message = supportService.addMessage(ticketId, content, sender);
        if (message) {
          // Reload the ticket from service to update messages and status
          const updatedTicket = supportService.getTicket(ticketId);
          if (updatedTicket) {
            set(state => ({
              tickets: state.tickets.map(t => (t.id === ticketId ? updatedTicket : t)),
            }));
          }
        }
      },

      // ====== Close Ticket ======
      closeTicket: (id: string) => {
        const closed = supportService.closeTicket(id);
        if (closed) {
          set(state => ({
            tickets: state.tickets.map(t => (t.id === id ? closed : t)),
          }));
        }
      },

      // ====== Submit Satisfaction Rating ======
      rateTicket: (ticketId: string, rating: number) => {
        try {
          const updated = supportService.submitSatisfactionRating(ticketId, rating);
          if (updated) {
            set(state => ({
              tickets: state.tickets.map(t => (t.id === ticketId ? updated : t)),
            }));
          }
        } catch (error) {
          console.error('Error submitting rating:', error);
          throw error;
        }
      },

      // ====== Load Dedicated Accountant ======
      loadAccountant: () => {
        const accountant = supportService.getDedicatedAccountant();
        set({ dedicatedAccountant: accountant });
      },

      // ====== Refresh List ======
      refreshTickets: () => {
        const tickets = supportService.listTickets();
        set({ tickets });
      },
    }),
    {
      name: 'cryptobooks_support',
      // Partial persistence
      partialize: (state) => ({
        tickets: state.tickets,
        dedicatedAccountant: state.dedicatedAccountant,
      }),
    },
  ),
);
