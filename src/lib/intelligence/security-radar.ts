/**
 * Security Radar for Sentinel
 * Analyzes wallet security: token approvals, risky contracts, permission exposure
 */

import { createServerClient } from '@/lib/supabase/server';

export interface SecurityScanResult {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  totalApprovals: number;
  unlimitedApprovals: number;
  highRiskApprovals: number;
  criticalApprovals: number;
  recommendations: SecurityRecommendation[];
  lastScannedAt: string;
}

export interface SecurityRecommendation {
  type: 'approval' | 'contract' | 'general';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  action: string;
  contractAddress?: string;
  tokenSymbol?: string;
}

export class SecurityRadar {
  async scanWallet(walletAddress: string): Promise<SecurityScanResult> {
    try {
      const supabase = createServerClient();
      
      // Get wallet ID
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, user_id')
        .ilike('address', walletAddress)
        .single();

      if (!wallet) {
        return this.emptyScanResult('Wallet not found');
      }

      // Get token approvals
      const { data: approvals } = await supabase
        .from('token_approvals')
        .select('*')
        .eq('wallet_id', wallet.id)
        .eq('is_revoked', false);

      const totalApprovals = approvals?.length || 0;
      const unlimitedApprovals = approvals?.filter(a => a.is_unlimited).length || 0;
      const highRiskApprovals = approvals?.filter(a => a.risk_level === 'high').length || 0;
      const criticalApprovals = approvals?.filter(a => a.risk_level === 'critical').length || 0;

      const riskScore = this.calculateRiskScore(totalApprovals, unlimitedApprovals, highRiskApprovals, criticalApprovals);
      const recommendations = this.generateRecommendations(approvals || []);

      return {
        overallRisk: this.getRiskLevel(riskScore),
        riskScore,
        totalApprovals,
        unlimitedApprovals,
        highRiskApprovals,
        criticalApprovals,
        recommendations,
        lastScannedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[SecurityRadar] scanWallet error:', error);
      return this.emptyScanResult('Scan failed');
    }
  }

  private calculateRiskScore(total: number, unlimited: number, high: number, critical: number): number {
    let score = 0;
    score += Math.min(total * 2, 20);
    score += unlimited * 15;
    score += high * 10;
    score += critical * 25;
    return Math.min(score, 100);
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  private generateRecommendations(approvals: any[]): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];

    for (const approval of approvals) {
      if (approval.is_unlimited) {
        recommendations.push({
          type: 'approval',
          severity: 'critical',
          title: `Unlimited ${approval.token_symbol || 'Token'} Approval`,
          description: `You have granted unlimited spending approval for ${approval.token_symbol || 'a token'} to ${approval.spender_name || approval.spender_address}`,
          action: 'Revoke this approval immediately and set a specific limit',
          contractAddress: approval.spender_address,
          tokenSymbol: approval.token_symbol,
        });
      }
      if (approval.risk_level === 'critical') {
        recommendations.push({
          type: 'contract',
          severity: 'critical',
          title: `Critical Risk Contract: ${approval.spender_name || 'Unknown'}`,
          description: `The contract at ${approval.spender_address} is flagged as critical risk`,
          action: 'Revoke approval and avoid interacting with this contract',
          contractAddress: approval.spender_address,
          tokenSymbol: approval.token_symbol,
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general',
        severity: 'info',
        title: 'Wallet Security Looks Good',
        description: 'No critical security issues detected. Keep monitoring your approvals regularly.',
        action: 'Run security scans periodically and review new approvals',
      });
    }

    return recommendations;
  }

  private emptyScanResult(reason: string): SecurityScanResult {
    return {
      overallRisk: 'low',
      riskScore: 0,
      totalApprovals: 0,
      unlimitedApprovals: 0,
      highRiskApprovals: 0,
      criticalApprovals: 0,
      recommendations: [{
        type: 'general',
        severity: 'info',
        title: 'No Data Available',
        description: reason,
        action: 'Add a wallet and sync data first',
      }],
      lastScannedAt: new Date().toISOString(),
    };
  }
}
