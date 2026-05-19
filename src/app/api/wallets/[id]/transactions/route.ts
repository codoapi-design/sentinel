/**
 * Wallet Transactions API Route
 *
 * GET  - Get stored transactions for a wallet
 * POST - Save transactions for a wallet (bulk upsert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { type Transaction } from '@/lib/mock-data';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Resolve wallet ID - handles both UUID and stale client-generated IDs
 */
async function resolveWalletId(
  walletIdOrAddress: string,
  userId: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<string | null> {
  // First try: direct UUID lookup
  const { data: walletById } = await supabase
    .from('wallets')
    .select('id')
    .eq('id', walletIdOrAddress)
    .eq('user_id', userId)
    .maybeSingle();

  if (walletById) return walletById.id;

  // Second try: if it looks like an address, look up by address
  if (walletIdOrAddress.startsWith('0x') && walletIdOrAddress.length === 42) {
    const { data: walletByAddr } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .ilike('address', walletIdOrAddress)
      .maybeSingle();

    if (walletByAddr) return walletByAddr.id;
  }

  // Third try: for stale wallet-XXXXX IDs, find any wallet for this user
  // that doesn't match a UUID pattern - return the first user wallet
  if (walletIdOrAddress.startsWith('wallet-')) {
    console.warn(`[WalletTx] Stale wallet ID detected: ${walletIdOrAddress}, trying first user wallet`);
    const { data: firstWallet } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (firstWallet) return firstWallet.id;
  }

  return null;
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

    // Authenticate user
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use service role client for data operations
    const supabase = createServerClient();

    // Resolve wallet ID with fallback
    const resolvedId = await resolveWalletId(walletId, user.id, supabase);

    if (!resolvedId) {
      return NextResponse.json(
        { error: 'Wallet not found', hint: 'Try removing and re-adding the wallet' },
        { status: 404 }
      );
    }

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', resolvedId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq('type', type);
    if (network) query = query.eq('network', network);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch transactions', details: error.message },
        { status: 500 }
      );
    }

    // Map of network keys to human-readable labels
    const NETWORK_LABELS: Record<string, string> = {
      ethereum: 'Ethereum',
      base: 'Base',
      arbitrum: 'Arbitrum',
      optimism: 'Optimism',
      polygon: 'Polygon',
      avalanche: 'Avalanche',
      bsc: 'BNB Chain',
      fantom: 'Fantom',
      gnosis: 'Gnosis',
      celo: 'Celo',
      linea: 'Linea',
      scroll: 'Scroll',
      zksync: 'zkSync',
      mantle: 'Mantle',
      blast: 'Blast',
    };

    // Map of transaction types to human-readable labels
    const TYPE_LABELS: Record<string, string> = {
      income: 'Income',
      expense: 'Expense',
      trade: 'Trade',
      defi: 'DeFi',
      staking: 'Staking',
      gas: 'Gas Fee',
      nft: 'NFT',
      bridge: 'Bridge',
    };

    // Convert DB rows to app Transaction format with proper fallbacks
    const transactions: Transaction[] = (data || []).map((row, i) => {
      const network = row.network || 'ethereum';
      const txType = row.type as Transaction['type'];
      const counterparty = row.counterparty || row.from_addr || '';

      // Build counterparty label with fallbacks
      let counterpartyLabel = row.counterparty_label || row.protocol_ar || row.protocol || '';
      if (!counterpartyLabel && counterparty.startsWith('0x')) {
        counterpartyLabel = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
      }

      // Safely compute price (avoid division by zero)
      const tokenValue = row.token_value || 0;
      const valueEth = row.value_eth || 0;
      const price = tokenValue > 0 ? valueEth / tokenValue : 0;

      return {
        id: row.id || `tx-${i}`,
        date: row.date || '',
        timestamp: row.timestamp || 0,
        type: txType || 'income',
        typeLabel: row.type_ar || TYPE_LABELS[txType] || txType,
        token: row.token_symbol || 'ETH',
        quantity: tokenValue || valueEth,
        price,
        value: valueEth,
        network,
        networkLabel: row.network_ar || NETWORK_LABELS[network] || network.charAt(0).toUpperCase() + network.slice(1),
        txHash: row.tx_hash || '',
        counterparty,
        counterpartyLabel,
      };
    });

    return NextResponse.json({
      success: true,
      data: transactions,
      total: count || transactions.length,
    });
  } catch (error) {
    console.error('Wallet Transactions GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
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

    // Authenticate user
    const cookieClient = await createCookieServerClient();
    const { data: { user }, error: authError } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { transactions } = body as { transactions: Transaction[] };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Transactions array is required' },
        { status: 400 }
      );
    }

    // Use service role client for data operations
    const supabase = createServerClient();

    // Resolve wallet ID with fallback
    const resolvedId = await resolveWalletId(walletId, user.id, supabase);

    if (!resolvedId) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      );
    }

    // Convert app Transactions to DB format
    const dbTransactions = transactions.map(tx => ({
      wallet_id: resolvedId,
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
        { error: 'Failed to save transactions', details: error.message },
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
      .eq('id', resolvedId);

    return NextResponse.json({
      success: true,
      saved: transactions.length,
    });
  } catch (error) {
    console.error('Wallet Transactions POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
