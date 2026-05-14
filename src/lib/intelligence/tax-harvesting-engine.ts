/**
 * Tax-Loss Harvesting Engine for Sentinel
 * Identifies opportunities to harvest tax losses and optimize tax position
 */

import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type AssetPositionRow = Database['public']['Tables']['asset_positions']['Row'];
type CostBasisEntryRow = Database['public']['Tables']['cost_basis_entries']['Row'];

export interface TaxHarvestOpportunity {
  token: string;
  name: string;
  unrealizedLoss: number;
  lossPct: number;
  quantity: number;
  currentPrice: number;
  averageCost: number;
  estimatedTaxSavings: number;
  washSaleRisk: boolean;
  recommendation: string;
  harvestDeadline: string | null;
}

export interface TaxHarvestSummary {
  totalHarvestableLoss: number;
  estimatedTaxSavings: number;
  opportunities: TaxHarvestOpportunity[];
  washSaleWarnings: string[];
  optimizationScore: number;
}

export class TaxHarvestingEngine {
  private taxRate: number = 0.25; // Default 25% tax rate

  async findHarvestOpportunities(walletAddress: string): Promise<TaxHarvestSummary> {
    try {
      const supabase = createServerClient();
      
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, user_id')
        .ilike('address', walletAddress)
        .single();

      if (!wallet) {
        return this.emptySummary('Wallet not found');
      }

      // Get positions with losses
      const { data: positions } = await supabase
        .from('asset_positions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .eq('is_spam', false)
        .lt('unrealized_pnl_usd', 0);

      // Get cost basis for wash sale check
      const { data: costBasis } = await supabase
        .from('cost_basis_entries')
        .select('*')
        .eq('wallet_id', wallet.id)
        .eq('is_disposed', false);

      const opportunities: TaxHarvestOpportunity[] = (positions || [])
        .filter(p => (p.unrealized_pnl_usd || 0) < 0)
        .map(p => {
          const loss = Math.abs(p.unrealized_pnl_usd || 0);
          const lossPct = Math.abs(p.unrealized_pnl_pct || 0);
          const balance = Number(p.balance) || 0;
          const avgCost = p.cost_basis_usd && balance ? p.cost_basis_usd / balance : 0;
          const taxSavings = loss * this.taxRate;
          
          return {
            token: p.token_symbol,
            name: p.token_name || p.token_symbol,
            unrealizedLoss: loss,
            lossPct,
            quantity: balance,
            currentPrice: p.price_usd || 0,
            averageCost: avgCost,
            estimatedTaxSavings: taxSavings,
            washSaleRisk: false,
            recommendation: lossPct > 20
              ? `Strong harvest candidate: ${p.token_symbol} is down ${lossPct.toFixed(1)}%. Selling now could save ~$${taxSavings.toFixed(2)} in taxes.`
              : `Consider harvesting: ${p.token_symbol} is down ${lossPct.toFixed(1)}%. Potential tax savings of ~$${taxSavings.toFixed(2)}.`,
            harvestDeadline: this.getHarvestDeadline(),
          };
        })
        .sort((a, b) => b.estimatedTaxSavings - a.estimatedTaxSavings);

      const totalHarvestableLoss = opportunities.reduce((s, o) => s + o.unrealizedLoss, 0);
      const estimatedTaxSavings = opportunities.reduce((s, o) => s + o.estimatedTaxSavings, 0);

      return {
        totalHarvestableLoss,
        estimatedTaxSavings,
        opportunities,
        washSaleWarnings: [],
        optimizationScore: this.calculateOptimizationScore(opportunities),
      };
    } catch (error) {
      console.error('[TaxHarvesting] findHarvestOpportunities error:', error);
      return this.emptySummary('Analysis failed');
    }
  }

  private calculateOptimizationScore(opportunities: TaxHarvestOpportunity[]): number {
    if (opportunities.length === 0) return 100;
    const avgLossPct = opportunities.reduce((s, o) => s + o.lossPct, 0) / opportunities.length;
    return Math.max(0, 100 - avgLossPct);
  }

  private getHarvestDeadline(): string {
    // December 31 of current year for US tax purposes
    const year = new Date().getFullYear();
    return `${year}-12-31T23:59:59Z`;
  }

  private emptySummary(reason: string): TaxHarvestSummary {
    return {
      totalHarvestableLoss: 0,
      estimatedTaxSavings: 0,
      opportunities: [],
      washSaleWarnings: [],
      optimizationScore: 100,
    };
  }
}
