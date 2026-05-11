import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, recordApiUsage } from '@/lib/api-keys/service';
import { generateTransactions } from '@/lib/mock-data';
import type { Transaction } from '@/lib/mock-data';

/**
 * GET /api/v1/transactions
 * Public API endpoint — list transactions for authenticated user
 *
 * Headers:
 * - x-api-key: API key (required)
 *
 * Query params:
 * - network: filter by network
 * - type: filter by transaction type
 * - from: start date (ISO string)
 * - to: end date (ISO string)
 * - limit: max results (default 25, max 100)
 * - offset: skip results (default 0)
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
    if (!apiKey.permissions.includes('transactions:read')) {
      recordApiUsage(apiKey.id, Date.now() - startTime, true);
      return NextResponse.json(
        { error: 'Insufficient permissions: transactions:read required' },
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
    const network = searchParams.get('network');
    const type = searchParams.get('type');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // ── Fetch transactions ──
    // In production, would query DB; using mock data for now
    let transactions = generateTransactions();

    // Apply filters
    if (network) {
      transactions = transactions.filter((tx: Transaction) => tx.network === network);
    }
    if (type) {
      transactions = transactions.filter((tx: Transaction) => tx.type === type);
    }
    if (from) {
      const fromDate = new Date(from);
      transactions = transactions.filter((tx: Transaction) => new Date(tx.date) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      transactions = transactions.filter((tx: Transaction) => new Date(tx.date) <= toDate);
    }

    // Paginate
    const total = transactions.length;
    const paginated = transactions.slice(offset, offset + limit);

    // Record usage
    recordApiUsage(apiKey.id, Date.now() - startTime, false);

    return NextResponse.json({
      success: true,
      data: paginated,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('V1 transactions GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
