/**
 * Tax Report Store — CryptoBooks Enterprise
 *
 * Zustand store with persistence for managing tax reports.
 * Supports selecting the calculation method (FIFO/LIFO) and fiscal year,
 * and generating reports from stored transactions.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Transaction } from '@/lib/mock-data';
import type { TaxReport, TaxLotMethod } from '@/lib/tax/types';
import { calculateTaxReport, getAvailableYears } from '@/lib/tax/engine';

// ============================================================
// State and Action Types
// ============================================================

interface TaxState {
  /** List of generated reports */
  reports: TaxReport[];
  /** Active report being displayed */
  activeReport: TaxReport | null;
  /** Selected tax lot calculation method */
  method: TaxLotMethod;
  /** Selected fiscal year */
  year: number;
  /** Loading state */
  isLoading: boolean;
}

interface TaxActions {
  /** Generate a tax report from transactions */
  generateReport: (transactions: Transaction[]) => TaxReport;
  /** Set the tax lot calculation method */
  setMethod: (method: TaxLotMethod) => void;
  /** Set the fiscal year */
  setYear: (year: number) => void;
  /** Set the active report */
  setActiveReport: (report: TaxReport | null) => void;
  /** Get available years from transactions */
  getYears: (transactions: Transaction[]) => number[];
}

// ============================================================
// Initial State
// ============================================================

const currentYear = new Date().getFullYear();

const initialState: TaxState = {
  reports: [],
  activeReport: null,
  method: 'fifo',
  year: currentYear,
  isLoading: false,
};

// ============================================================
// Store
// ============================================================

export const useTaxStore = create<TaxState & TaxActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Generate Tax Report ======
      generateReport: (transactions: Transaction[]) => {
        set({ isLoading: true });

        try {
          const { method, year } = get();
          const report = calculateTaxReport(transactions, method, year);

          set(state => ({
            reports: [report, ...state.reports],
            activeReport: report,
            isLoading: false,
          }));

          return report;
        } catch (error) {
          console.error('Error generating tax report:', error);
          set({ isLoading: false });
          throw error;
        }
      },

      // ====== Set Calculation Method ======
      setMethod: (method: TaxLotMethod) => {
        set({ method });
      },

      // ====== Set Year ======
      setYear: (year: number) => {
        set({ year });
      },

      // ====== Set Active Report ======
      setActiveReport: (report: TaxReport | null) => {
        set({ activeReport: report });
      },

      // ====== Get Available Years ======
      getYears: (transactions: Transaction[]) => {
        return getAvailableYears(transactions);
      },
    }),
    {
      name: 'cryptobooks_tax',
      // Partial persistence — don't save loading state
      partialize: (state) => ({
        reports: state.reports,
        method: state.method,
        year: state.year,
      }),
    },
  ),
);
