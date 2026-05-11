/**
 * Data Ingestion Service for Sentinel
 * Syncs wallet data from blockchain providers into Supabase
 */

import { createServerClient } from '@/lib/supabase/server';
import { getBlockchainService } from '@/lib/blockchain-unified';

export class DataIngestionService {
  async syncWallet(walletId: string): Promise<{ success: boolean; recordsSynced: number; errors: string[] }> {
    const errors: string[] = [];
    let recordsSynced = 0;

    try {
      const supabase = createServerClient();
      
      // Get wallet info
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .single();

      if (walletError || !wallet) {
        return { success: false, recordsSynced: 0, errors: ['Wallet not found'] };
      }

      // Mark as syncing
      await supabase
        .from('wallets')
        .update({ is_syncing: true })
        .eq('id', walletId);

      try {
        // Fetch portfolio data
        const blockchain = getBlockchainService();
        const portfolio = await blockchain.getPortfolio(wallet.address);

        // Upsert token positions
        for (const token of portfolio.tokens) {
          if (token.valueUsd < 0.01) continue; // Skip dust
          
          const { error: upsertError } = await supabase
            .from('asset_positions')
            .upsert({
              wallet_id: walletId,
              user_id: wallet.user_id,
              token_symbol: token.symbol,
              token_name: token.name,
              token_address: token.address,
              token_decimals: token.decimals,
              network: token.chain,
              balance: token.balance,
              balance_raw: String(token.balance * Math.pow(10, token.decimals)),
              price_usd: token.priceUsd,
              value_usd: token.valueUsd,
              source: portfolio.provider,
              is_spam: token.isSpam || false,
            }, { onConflict: 'wallet_id,token_address,network' });

          if (upsertError) {
            errors.push(`Failed to upsert ${token.symbol}: ${upsertError.message}`);
          } else {
            recordsSynced++;
          }
        }

        // Upsert DeFi positions
        for (const defi of portfolio.defiPositions) {
          const { error: upsertError } = await supabase
            .from('defi_positions')
            .upsert({
              wallet_id: walletId,
              user_id: wallet.user_id,
              protocol_name: defi.protocol,
              protocol_chain: defi.chain,
              protocol_logo: defi.logoUrl,
              position_type: defi.type,
              supplied_tokens: defi.suppliedTokens,
              borrowed_tokens: defi.borrowedTokens,
              reward_tokens: defi.rewardTokens,
              net_value_usd: defi.netValueUsd,
              asset_value_usd: defi.assetValueUsd,
              debt_value_usd: defi.debtValueUsd,
              apy: defi.apy,
              health_factor: defi.healthFactor,
              source: portfolio.provider,
            });

          if (upsertError) {
            errors.push(`Failed to upsert DeFi ${defi.protocol}: ${upsertError.message}`);
          } else {
            recordsSynced++;
          }
        }

        // Update wallet sync status
        await supabase
          .from('wallets')
          .update({
            is_syncing: false,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', walletId);

        // Update sync_status table
        await supabase
          .from('sync_status')
          .upsert({
            wallet_id: walletId,
            provider: portfolio.provider,
            data_type: 'portfolio',
            last_synced_at: new Date().toISOString(),
            status: 'completed',
            records_synced: recordsSynced,
          }, { onConflict: 'wallet_id,provider,data_type' });

      } catch (syncError) {
        errors.push(`Sync error: ${syncError}`);
        await supabase
          .from('wallets')
          .update({ is_syncing: false })
          .eq('id', walletId);
      }

      return { success: errors.length === 0, recordsSynced, errors };
    } catch (error) {
      return { success: false, recordsSynced: 0, errors: [String(error)] };
    }
  }
}
