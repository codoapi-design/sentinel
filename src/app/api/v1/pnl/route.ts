import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, recordApiUsage } from '@/lib/api-keys/service';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getBlockchainCache } from '@/lib/blockchain/cache';

/**
 * GET /api/v1/pnl
 * Public API endpoint — get PnL (Profit and Loss) data for a wallet using hybrid architecture
 *
 * Headers:
 * - x-api-key: API key (required)
 *
 * Query params:
 * - wallet: Wallet address (required)
 * - refresh: Force refresh from providers (default: false)
 *
 * PnL data is primarily sourced from Zerion, which provides
 * daily and weekly change percentages for positions.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Authenticate ──
    const apiKeyHeader = request.headers.get('x-api-key');
    if (!apiKeyHeader) {
      return NextResponse.json(
        { error: 'Missing x-api-key header' },
        { status: 401 },
      );
    }

    const apiKey = validateApiKey(apiKeyHeader);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 },
      );
    }

    // ── Check permissions ──
    if (!apiKey.permissions.includes('portfolio:read')) {
      recordApiUsage(apiKey.id, Date.now() - startTime, true);
      return NextResponse.json(
        { error: 'Insufficient permissions: portfolio:read required' },
        { status: 403 },
      );
    }

    // ── Rate limit ──
    if (!checkRateLimit(apiKey.id)) {
      recordApiUsage(apiKey.id, Date.now() - startTime, true);
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      );
    }

    // ── Parse query params ──
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');
    const forceRefresh = searchParams.get('refresh') === 'true';

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'wallet query parameter is required' },
        { status: 400 },
      );
    }

    if (!walletAddress.startsWith('0x') || walletAddress.length !== 42) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 },
      );
    }

    // ── Fetch PnL using hybrid architecture ──
    const providerManager = getProviderManager();
    const cache = getBlockchainCache();

    if (forceRefresh) {
      await cache.invalidate(walletAddress, 'pnl');
    }

    const pnl = await providerManager.fetchPnL(walletAddress);

    if (!pnl) {
      recordApiUsage(apiKey.id, Date.now() - startTime, false);
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No PnL data available for this wallet',
      });
    }

    // Record usage
    recordApiUsage(apiKey.id, Date.now() - startTime, false);

    return NextResponse.json({
      success: true,
      data: {
        totalPnLUsd: pnl.totalPnLUsd,
        totalPnLPercent: pnl.totalPnLPercent,
        dailyPnLUsd: pnl.dailyPnLUsd,
        dailyPnLPercent: pnl.dailyPnLPercent,
        weeklyPnLUsd: pnl.weeklyPnLUsd,
        weeklyPnLPercent: pnl.weeklyPnLPercent,
        monthlyPnLUsd: pnl.monthlyPnLUsd,
        monthlyPnLPercent: pnl.monthlyPnLPercent,
        costBasisUsd: pnl.costBasisUsd,
        currentValueUsd: pnl.currentValueUsd,
        provider: 'zerion',
      },
      meta: {
        wallet: walletAddress,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('V1 PnL GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
