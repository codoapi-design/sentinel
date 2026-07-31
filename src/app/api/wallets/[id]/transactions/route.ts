/**
 * Wallet Transactions API Route
 *
 * GET  - Get stored transactions for a wallet
 * POST - Save transactions for a wallet (bulk upsert)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';
import { refineTransactionType, resolveTypeLabel } from '@/lib/finance/summary';
import { resolveOnChainActivity } from '@/lib/finance/activity';
import { isTrustedTransaction } from '@/lib/finance/token-trust';
import { getTransactionLimit } from '@/lib/plans/limits';
import { resolveAuthoritativePlan } from '@/lib/plans/resolve-plan';
import { type Transaction } from '@/lib/mock-data';
import { getPricingService } from '@/lib/pricing/service';

/** Hard ceiling so a runaway client cannot request millions of rows at once. */
const ABSOLUTE_MAX_PAGE = 2000;
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
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const requestedLimit = parseInt(searchParams.get('limit') || '', 10);

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

    const plan = await resolveAuthoritativePlan(supabase, user.id, { syncProfile: false });
    const planCap = getTransactionLimit(plan?.pricingPlanId || plan?.walletPlanId || 'starter');
    // Unlimited plans: no artificial 500 cap — page size defaults to 1000.
    const defaultPage = Number.isFinite(planCap) ? Math.min(planCap, 1000) : 1000;
    const limit = Math.min(
      ABSOLUTE_MAX_PAGE,
      Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : defaultPage,
    );
    // Enforce plan retention window on the offset window.
    const maxOffset = Number.isFinite(planCap) ? Math.max(0, planCap - 1) : Number.MAX_SAFE_INTEGER;
    if (offset > maxOffset) {
      return NextResponse.json({
        success: true,
        data: [],
        total: 0,
        planLimit: Number.isFinite(planCap) ? planCap : null,
        hasMore: false,
      });
    }
    const effectiveLimit = Number.isFinite(planCap)
      ? Math.min(limit, Math.max(0, planCap - offset))
      : limit;

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('wallet_id', resolvedId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + Math.max(effectiveLimit, 1) - 1);

    if (type) query = query.eq('type', type);
    if (network) query = query.eq('network', network);

    const { data, error } = await query;

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

    // Map of transaction types to accounting classification labels (English)
    const TYPE_LABELS: Record<string, string> = {
      income: 'Income',
      expense: 'Expense',
      trade: 'Trade',
      defi: 'DeFi',
      staking: 'Staking Reward',
      gas: 'Gas Fee',
      nft: 'NFT',
      bridge: 'Bridge',
    };

    // Convert DB rows to app Transaction format — verified / non-spam assets only.
    let ethPriceUsd = 0;
    try {
      ethPriceUsd = await getPricingService().getCurrentNativePriceUsd(1);
    } catch {
      ethPriceUsd = 0;
    }

    const transactions: Transaction[] = (data || [])
      .filter(row =>
        isTrustedTransaction({
          token_symbol: row.token_symbol,
          token_name: row.token_name,
          token_address: row.token_address,
          price_usd: row.price_usd,
          value_usd: row.value_usd,
          value_eth: row.value_eth,
          network: row.network,
        }),
      )
      .map((row, i) => {
      const network = row.network || 'ethereum';
      const refinedType = refineTransactionType({
        type: row.type,
        methodId: row.method_id,
        methodName: row.method_name,
        protocol: row.protocol,
        to: row.to_addr,
        direction: row.direction,
        statusFailed: row.status === false,
      });
      const txType = refinedType as Transaction['type'];
      const counterparty = row.counterparty || row.from_addr || '';

      // Prefer English protocol / shortened address — never Arabic protocol_ar in UI
      let counterpartyLabel = row.counterparty_label || row.protocol || '';
      if (counterpartyLabel && /[\u0600-\u06FF]/.test(counterpartyLabel)) {
        counterpartyLabel = row.protocol || '';
      }
      if (!counterpartyLabel && counterparty.startsWith('0x')) {
        counterpartyLabel = `${counterparty.slice(0, 6)}...${counterparty.slice(-4)}`;
      }

      // Safely compute USD price and value — never treat raw ETH quantity as dollars
      const tokenValue = row.token_value || 0;
      const valueUsd = typeof row.value_usd === 'number' && Number.isFinite(row.value_usd)
        ? row.value_usd
        : 0;
      const priceUsd = row.price_usd || 0;

      // Fallback for rows synced before USD columns existed
      const price = priceUsd > 0
        ? priceUsd
        : (tokenValue > 0 && valueUsd > 0 ? valueUsd / tokenValue : 0);
      const value = valueUsd;

      const activity = resolveOnChainActivity({
        direction: row.direction,
        methodId: row.method_id,
        methodName: row.method_name,
        type: txType,
        statusFailed: row.status === false,
      });

      const gasFeeEth =
        typeof row.gas_fee_eth === 'number' && Number.isFinite(row.gas_fee_eth) && row.gas_fee_eth > 0
          ? row.gas_fee_eth
          : 0;
      const gasUsed =
        typeof row.gas_used === 'number' && Number.isFinite(row.gas_used) && row.gas_used > 0
          ? row.gas_used
          : 0;
      const gasFeeUsd = gasFeeEth > 0 && ethPriceUsd > 0 ? gasFeeEth * ethPriceUsd : 0;

      return {
        id: row.id || `tx-${i}`,
        date: row.date || '',
        timestamp: row.timestamp || 0,
        type: txType,
        // Always English classification — ignore legacy Arabic type_ar
        typeLabel: TYPE_LABELS[txType] || resolveTypeLabel(txType) || txType,
        activity,
        methodName: row.method_name || null,
        direction: row.direction || null,
        token: row.token_symbol || 'ETH',
        quantity: tokenValue || (row.value_eth || 0),
        price,
        value,
        network,
        networkLabel: NETWORK_LABELS[network] || network.charAt(0).toUpperCase() + network.slice(1),
        txHash: row.tx_hash || '',
        counterparty,
        counterpartyLabel,
        gasUsed,
        gasFeeEth,
        gasFeeUsd,
      };
    });

    const pageLen = (data || []).length;
    const hasMore =
      pageLen >= effectiveLimit &&
      (Number.isFinite(planCap) ? offset + pageLen < planCap : true);

    return NextResponse.json({
      success: true,
      data: transactions,
      total: transactions.length,
      offset,
      limit: effectiveLimit,
      planLimit: Number.isFinite(planCap) ? planCap : null,
      hasMore,
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
      value_usd: tx.value,
      price_usd: tx.price,
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
