/**
 * True ROI Analyst for Radareum
 * Calculates true returns including cost basis, fees, and opportunity cost
 */

import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type AssetPositionRow = Database['public']['Tables']['asset_positions']['Row'];
type CostBasisEntryRow = Database['public']['Tables']['cost_basis_entries']['Row'];

export interface ROIAnalysis {
  totalInvested: number;
  currentValue: number;
  totalReturn: number;
  returnPct: number;
  realizedGains: number;
  unrealizedGains: number;
  totalFeesPaid: number;
  netReturn: number;
  netReturnPct: number;
  bestPerformer: TokenROI | null;
  worstPerformer: TokenROI | null;
  tokenBreakdown: TokenROI[];
  monthlyPerformance: MonthlyPerformance[];
  analysisDate: string;
}

export interface TokenROI {
  symbol: string;
  name: string;
  invested: number;
  currentValue: number;
  return: number;
  returnPct: number;
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
}

export interface MonthlyPerformance {
  month: string;
  invested: number;
  value: number;
  return: number;
  returnPct: number;
}

export class ROIAnalyst {
  async analyzeWallet(walletAddress: string): Promise<ROIAnalysis> {
    try {
      const supabase = createServerClient();
      
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, user_id')
        .ilike('address', walletAddress)
        .single();

      if (!wallet) {
        return this.emptyAnalysis('Wallet not found');
      }

      // Get cost basis entries
      const { data: costBasis } = await supabase
        .from('cost_basis_entries')
        .select('*')
        .eq('wallet_id', wallet.id);

      // Get current positions
      const { data: positions } = await supabase
        .from('asset_positions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .eq('is_spam', false);

      const tokenBreakdown = this.calculateTokenROI(costBasis || [], positions || []);
      const totalInvested = tokenBreakdown.reduce((s, t) => s + t.invested, 0);
      const currentValue = tokenBreakdown.reduce((s, t) => s + t.currentValue, 0);
      const realizedGains = (costBasis || []).filter(c => c.is_disposed).reduce((s, c) => s + (c.realized_pnl_usd || 0), 0);
      const totalFeesPaid = 0; // Calculate from transactions

      const totalReturn = currentValue - totalInvested;
      const netReturn = totalReturn + realizedGains - totalFeesPaid;

      const bestPerformer = tokenBreakdown.length > 0
        ? tokenBreakdown.reduce((best, t) => t.returnPct > best.returnPct ? t : best)
        : null;
      const worstPerformer = tokenBreakdown.length > 0
        ? tokenBreakdown.reduce((worst, t) => t.returnPct < worst.returnPct ? t : worst)
        : null;

      return {
        totalInvested,
        currentValue,
        totalReturn,
        returnPct: totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0,
        realizedGains,
        unrealizedGains: totalReturn,
        totalFeesPaid,
        netReturn,
        netReturnPct: totalInvested > 0 ? (netReturn / totalInvested) * 100 : 0,
        bestPerformer,
        worstPerformer,
        tokenBreakdown,
        monthlyPerformance: [],
        analysisDate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[ROIAnalyst] analyzeWallet error:', error);
      return this.emptyAnalysis('Analysis failed');
    }
  }

  private calculateTokenROI(costBasis: CostBasisEntryRow[], positions: AssetPositionRow[]): TokenROI[] {
    const tokenMap = new Map<string, TokenROI>();

    for (const cb of costBasis) {
      const key = `${cb.token_symbol}-${cb.network}`;
      const existing = tokenMap.get(key);
      const invested = (existing?.invested || 0) + cb.total_cost_usd;
      const qty = (existing?.quantity || 0) + cb.remaining_quantity;
      
      tokenMap.set(key, {
        symbol: cb.token_symbol,
        name: cb.token_symbol,
        invested,
        currentValue: 0,
        return: 0,
        returnPct: 0,
        quantity: qty,
        averageBuyPrice: qty > 0 ? invested / qty : 0,
        currentPrice: 0,
      });
    }

    for (const pos of positions) {
      const key = `${pos.token_symbol}-${pos.network}`;
      const existing = tokenMap.get(key);
      if (existing) {
        existing.currentValue = pos.value_usd || 0;
        existing.currentPrice = pos.price_usd || 0;
        existing.return = existing.currentValue - existing.invested;
        existing.returnPct = existing.invested > 0 ? (existing.return / existing.invested) * 100 : 0;
        existing.name = pos.token_name || existing.symbol;
      } else {
        tokenMap.set(key, {
          symbol: pos.token_symbol,
          name: pos.token_name || pos.token_symbol,
          invested: pos.cost_basis_usd || 0,
          currentValue: pos.value_usd || 0,
          return: (pos.value_usd || 0) - (pos.cost_basis_usd || 0),
          returnPct: pos.cost_basis_usd ? (pos.unrealized_pnl_pct || 0) : 0,
          quantity: Number(pos.balance) || 0,
          averageBuyPrice: pos.cost_basis_usd && Number(pos.balance) ? pos.cost_basis_usd / Number(pos.balance) : 0,
          currentPrice: pos.price_usd || 0,
        });
      }
    }

    return Array.from(tokenMap.values());
  }

  private emptyAnalysis(reason: string): ROIAnalysis {
    return {
      totalInvested: 0, currentValue: 0, totalReturn: 0, returnPct: 0,
      realizedGains: 0, unrealizedGains: 0, totalFeesPaid: 0,
      netReturn: 0, netReturnPct: 0, bestPerformer: null, worstPerformer: null,
      tokenBreakdown: [], monthlyPerformance: [],
      analysisDate: new Date().toISOString(),
    };
  }
}
