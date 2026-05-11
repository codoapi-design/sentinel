/**
 * Wallet Sync API Route
 *
 * POST /api/wallets/[id]/sync
 * Trigger a sync from Alchemy for a wallet, fetching only new transactions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { fetchAndClassifyTransactions, NETWORKS, type ClassifiedTransaction } from '@/lib/alchemy';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/wallets/[id]/sync
 * Sync wallet from Alchemy - fetch new transactions only
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: walletId } = await params;
    const supabase = createServerClient();

    // Get wallet info
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    if (wallet.is_syncing) {
      return NextResponse.json(
        { error: 'Wallet is already syncing' },
        { status: 409 }
      );
    }

    // Mark as syncing
    await supabase
      .from('wallets')
      .update({ is_syncing: true })
      .eq('id', walletId);

    try {
      const address = wallet.address;
      const lastSyncedBlock = wallet.last_synced_block;

      // Determine fromBlock: use last synced block or recent blocks
      let fromBlock = 'latest';
      if (lastSyncedBlock && lastSyncedBlock > 0) {
        // Start from the block after the last synced one
        fromBlock = `0x${(lastSyncedBlock + 1).toString(16)}`;
      }

      let totalNewTransactions = 0;

      // Fetch from all supported networks
      for (const [networkKey, networkConfig] of Object.entries(NETWORKS)) {
        try {
          // For initial sync (no lastSyncedBlock), use a recent block range
          const effectiveFromBlock = !lastSyncedBlock ? undefined : fromBlock;

          const result = await fetchAndClassifyTransactions({
            walletAddress: address,
            networkKey,
            fromBlock: effectiveFromBlock,
            maxCount: 100,
          });

          if (result.transactions.length > 0) {
            // Convert to DB format and upsert
            const dbTransactions = result.transactions.map(tx =>
              classifiedTxToDbRow(tx, walletId, networkKey)
            );

            const { error: upsertError } = await supabase
              .from('transactions')
              .upsert(dbTransactions, {
                onConflict: 'tx_hash,wallet_id,network',
                ignoreDuplicates: true,
              });

            if (upsertError) {
              console.error(`Error upserting ${networkKey} transactions:`, upsertError);
            }

            totalNewTransactions += result.transactions.length;
          }

          // Update last synced block for this network
          if (result.transactions.length > 0) {
            const maxBlock = Math.max(
              ...result.transactions.map(tx => tx.blockNumber)
            );
            if (!lastSyncedBlock || maxBlock > lastSyncedBlock) {
              await supabase
                .from('wallets')
                .update({ last_synced_block: maxBlock })
                .eq('id', walletId);
            }
          }
        } catch (networkError) {
          console.error(`Error syncing ${networkKey}:`, networkError);
          // Continue with other networks
        }
      }

      // Update sync status
      await supabase
        .from('wallets')
        .update({
          is_syncing: false,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      return NextResponse.json({
        success: true,
        newTransactions: totalNewTransactions,
      });
    } catch (syncError) {
      // Reset syncing status on error
      await supabase
        .from('wallets')
        .update({ is_syncing: false })
        .eq('id', walletId);

      throw syncError;
    }
  } catch (error) {
    console.error('Wallet Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Convert a ClassifiedTransaction to a DB row format
 */
function classifiedTxToDbRow(
  tx: ClassifiedTransaction,
  walletId: string,
  networkKey: string
) {
  return {
    wallet_id: walletId,
    tx_hash: tx.txHash,
    block_number: tx.blockNumber,
    timestamp: tx.timestamp,
    date: tx.date,
    from_addr: tx.from,
    to_addr: tx.to,
    value_wei: tx.value,
    value_eth: tx.valueEth,
    gas_used: tx.gasUsed,
    gas_price_wei: tx.gasPrice,
    gas_fee_eth: tx.gasFeeEth,
    status: tx.status,
    type: tx.type,
    type_ar: tx.typeAr,
    direction: tx.direction,
    method_id: tx.methodId,
    method_name: tx.methodName,
    protocol: tx.protocol,
    protocol_ar: tx.protocolAr,
    network: networkKey,
    network_ar: tx.networkAr,
    token_symbol: tx.tokenTransfers[0]?.tokenSymbol || null,
    token_name: tx.tokenTransfers[0]?.tokenName || null,
    token_address: tx.tokenTransfers[0]?.tokenAddress || null,
    token_value: tx.tokenTransfers[0]?.valueFormatted || 0,
    token_decimals: tx.tokenTransfers[0]?.decimals || 18,
    counterparty: tx.direction === 'in' ? tx.from : tx.to,
    counterparty_label: tx.protocolAr || tx.protocol || null,
  };
}
