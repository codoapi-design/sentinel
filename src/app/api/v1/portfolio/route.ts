import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, recordApiUsage } from '@/lib/api-keys/service';
import { assets, dashboardSummary, generatePortfolioHistory } from '@/lib/mock-data';

/**
 * GET /api/v1/portfolio
 * Public API endpoint — get portfolio summary
 *
 * Headers:
 * - x-api-key: API key (required)
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

    // ── Build portfolio data ──
    const portfolioHistory = generatePortfolioHistory();

    const data = {
      summary: dashboardSummary,
      assets: assets.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        quantity: a.quantity,
        price: a.price,
        value: a.value,
        change24h: a.change24h,
      })),
      history: portfolioHistory,
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
