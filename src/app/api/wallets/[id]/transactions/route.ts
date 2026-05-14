/**
 * Wallet Transactions API Route
 *
 * GET  - Get stored transactions for a wallet
 * POST - Save transactions for a wallet (bulk upsert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { type Transaction } from '@/lib/mock-data';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/wallets/[id]/transactions
 * Get stored transactions for a wallet
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: walletId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const network = searchParams.get('network');
    const limit = parseInt(searchParams.get('limit') || '500');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createServerClient();

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq('type', type);
    if (network) query = query.eq('network', network);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    // Convert DB rows to app Transaction format
    const transactions: Transaction[] = (data || []).map((row, i) => ({
      id: row.id || `tx-${i}`,
      date: row.date,
      timestamp: row.timestamp,
      type: row.type as Transaction['type'],
      typeLabel: row.type_ar,
      token: row.token_symbol || 'ETH',
      quantity: row.token_value || row.value_eth,
      price: row.token_value ? (row.value_eth / row.token_value) : 0,
      value: row.value_eth,
      network: row.network,
      networkLabel: row.network_ar,
      txHash: row.tx_hash,
      counterparty: row.counterparty || row.from_addr,
      counterpartyLabel: row.counterparty_label || row.protocol_ar || row.protocol || '',
    }));

    return NextResponse.json({
      success: true,
      data: transactions,
      total: count || transactions.length,
    });
  } catch (error) {
    console.error('Wallet Transactions GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallets/[id]/transactions
 * Save transactions for a wallet (bulk upsert)
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: walletId } = await params;
    const body = await request.json();
    const { transactions } = body as { transactions: Transaction[] };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Transactions array is required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Convert app Transactions to DB format
    const dbTransactions = transactions.map(tx => ({
      wallet_id: walletId,
      tx_hash: tx.txHash,
      block_number: 0,
      timestamp: tx.timestamp,
      date: tx.date,
      from_addr: '',
      to_addr: '',
      value_eth: tx.value,
      type: tx.type,
      type_ar: tx.typeLabel,
      direction: 'in',
      network: tx.network,
      network_ar: tx.networkLabel,
      token_symbol: tx.token !== 'ETH' ? tx.token : null,
      token_name: tx.token !== 'ETH' ? tx.token : null,
      counterparty: tx.counterparty,
      counterparty_label: tx.counterpartyLabel,
      protocol: tx.counterpartyLabel,
      protocol_ar: tx.counterpartyLabel,
    }));

    // Upsert transactions (unique on tx_hash + wallet_id + network)
    const { error } = await supabase
      .from('transactions')
      .upsert(dbTransactions, {
        onConflict: 'tx_hash,wallet_id,network',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error('Error saving transactions:', error);
      return NextResponse.json(
        { error: 'Failed to save transactions' },
        { status: 500 }
      );
    }

    // Update wallet last_synced_at
    await supabase
      .from('wallets')
      .update({
        last_synced_at: new Date().toISOString(),
        is_syncing: false,
      })
      .eq('id', walletId);

    return NextResponse.json({
      success: true,
      saved: transactions.length,
    });
  } catch (error) {
    console.error('Wallet Transactions POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
