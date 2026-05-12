import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, recordApiUsage } from '@/lib/api-keys/service';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getBlockchainCache } from '@/lib/blockchain/cache';

/**
 * GET /api/v1/portfolio
 * Public API endpoint — get portfolio summary using hybrid architecture
 *
 * Headers:
 * - x-api-key: API key (required)
 *
 * Query params:
 * - wallet: Wallet address (required)
 * - refresh: Force refresh from providers (default: false)
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

    // ── Get wallet address ──
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

    // ── Fetch portfolio using hybrid architecture ──
    const providerManager = getProviderManager();
    const cache = getBlockchainCache();

    // Invalidate cache if refresh requested
    if (forceRefresh) {
      await cache.invalidate(walletAddress, 'portfolio');
    }

    const portfolio = await providerManager.getPortfolio(walletAddress);

    // ── Build response ──
    const data = {
      address: portfolio.address,
      totalValueUsd: portfolio.totalValueUsd,
      tokenValueUsd: portfolio.tokenValueUsd,
      defiValueUsd: portfolio.defiValueUsd,
      tokens: portfolio.tokens.map(t => ({
        symbol: t.symbol,
        name: t.name,
        balance: t.balance,
        priceUsd: t.priceUsd,
        valueUsd: t.valueUsd,
        change24h: t.change24h,
        chain: t.chain,
        provider: t.provider,
      })),
      defiPositions: portfolio.defiPositions.map(p => ({
        protocol: p.protocol,
        type: p.type,
        netValueUsd: p.netValueUsd,
        chain: p.chain,
        provider: p.provider,
      })),
      chainBreakdown: portfolio.chainBreakdown,
      providers: portfolio.providers,
      lastUpdated: portfolio.lastUpdated,
      generatedAt: new Date().toISOString(),
    };

    // Record usage
    recordApiUsage(apiKey.id, Date.now() - startTime, false);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('V1 portfolio GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
