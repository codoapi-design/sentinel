/**
 * Airdrop Hunter for Radareum
 * Discovers and tracks airdrop opportunities for connected wallets
 */

import { createServerClient } from '@/lib/supabase/server';
import { getBlockchainService } from '@/lib/blockchain-unified';
import type { Database } from '@/lib/supabase/types';

type AirdropRow = Database['public']['Tables']['airdrops']['Row'];

export interface AirdropOpportunity {
  id: string;
  name: string;
  protocol: string;
  network: string;
  estimatedValue: number;
  status: 'active' | 'expired' | 'claimed' | 'upcoming';
  deadline: string | null;
  claimUrl: string | null;
  eligibilityCriteria: string;
  isEligible: boolean;
  isClaimed: boolean;
}

export class AirdropHunter {
  async findAirdrops(walletAddress: string): Promise<AirdropOpportunity[]> {
    try {
      const supabase = createServerClient();
      
      // Get wallet
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, user_id')
        .ilike('address', walletAddress)
        .single();

      // Get active airdrop opportunities from DB
      const { data: airdropsData } = await supabase
        .from('airdrops')
        .select('*')
        .eq('status', 'active');

      const airdrops = (airdropsData || []) as AirdropRow[];

      // Map to response format
      const opportunities: AirdropOpportunity[] = airdrops.map(a => {
        return {
          id: a.id,
          name: a.name,
          protocol: a.protocol,
          network: a.network,
          estimatedValue: a.estimated_value_usd || 0,
          status: a.status as AirdropOpportunity['status'],
          deadline: a.deadline,
          claimUrl: a.claim_url,
          eligibilityCriteria: JSON.stringify(a.eligibility_criteria || {}),
          isEligible: true,
          isClaimed: false,
        };
      });

      // Add AI-detected opportunities based on wallet activity
      if (wallet) {
        const aiAirdrops = await this.detectAirdropsFromActivity(walletAddress);
        opportunities.push(...aiAirdrops);
      }

      return opportunities;
    } catch (error) {
      console.error('[AirdropHunter] findAirdrops error:', error);
      return [];
    }
  }

  private async detectAirdropsFromActivity(address: string): Promise<AirdropOpportunity[]> {
    // Common airdrop patterns based on wallet interactions
    const potentialAirdrops: AirdropOpportunity[] = [];
    
    try {
      const blockchain = getBlockchainService();
      const portfolio = await blockchain.getPortfolio(address);
      
      // Check for DeFi protocol interactions that might lead to airdrops
      const protocolSet = new Set(portfolio.defiPositions.map(p => p.protocol.toLowerCase()));
      
      const knownAirdropProtocols = [
        { protocol: 'uniswap', name: 'Uniswap', network: 'ethereum' },
        { protocol: 'aave', name: 'Aave', network: 'ethereum' },
        { protocol: 'compound', name: 'Compound', network: 'ethereum' },
        { protocol: 'curve', name: 'Curve', network: 'ethereum' },
        { protocol: 'lido', name: 'Lido', network: 'ethereum' },
        { protocol: 'maker', name: 'Maker/Sky', network: 'ethereum' },
        { protocol: '1inch', name: '1inch', network: 'ethereum' },
        { protocol: 'pendle', name: 'Pendle', network: 'ethereum' },
      ];

      for (const known of knownAirdropProtocols) {
        for (const userProtocol of protocolSet) {
          if (userProtocol.includes(known.protocol)) {
            potentialAirdrops.push({
              id: `detected-${known.protocol}`,
              name: `${known.name} Potential Airdrop`,
              protocol: known.name,
              network: known.network,
              estimatedValue: 0,
              status: 'active',
              deadline: null,
              claimUrl: null,
              eligibilityCriteria: `Active ${known.name} user - may qualify for future airdrops`,
              isEligible: true,
              isClaimed: false,
            });
          }
        }
      }
    } catch (error) {
      console.error('[AirdropHunter] detectAirdropsFromActivity error:', error);
    }

    return potentialAirdrops;
  }
}
