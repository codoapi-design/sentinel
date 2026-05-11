import { NextRequest, NextResponse } from 'next/server';
import { calculateTaxReport, getAvailableYears } from '@/lib/tax/engine';
import { generateTransactions } from '@/lib/mock-data';
import type { Transaction } from '@/lib/mock-data';
import type { TaxLotMethod } from '@/lib/tax/types';

const VALID_METHODS: TaxLotMethod[] = ['fifo', 'lifo'];

/**
 * GET /api/tax
 * Get tax report for a year
 *
 * Query params:
 * - year: number (required)
 * - method: 'fifo' | 'lifo' (default: 'fifo')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const methodParam = searchParams.get('method') || 'fifo';

    if (!yearParam) {
      return NextResponse.json(
        { error: 'year query parameter is required' },
        { status: 400 },
      );
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid year' },
        { status: 400 },
      );
    }

    const method = methodParam as TaxLotMethod;
    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json(
        { error: 'method must be "fifo" or "lifo"' },
        { status: 400 },
      );
    }

    // Use mock transactions for now
    const transactions = generateTransactions();
    const report = calculateTaxReport(transactions, method, year);
    const availableYears = getAvailableYears(transactions);

    return NextResponse.json({
      success: true,
      data: report,
      meta: { availableYears },
    });
  } catch (error) {
    console.error('Tax GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tax
 * Generate/regenerate tax report
 *
 * Body: {
 *   year: number,
 *   method?: 'fifo' | 'lifo',
 *   transactions?: Transaction[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, method, transactions } = body as {
      year?: number;
      method?: TaxLotMethod;
      transactions?: Transaction[];
    };

    if (!year) {
      return NextResponse.json(
        { error: 'year is required' },
        { status: 400 },
      );
    }

    if (year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid year' },
        { status: 400 },
      );
    }

    const taxMethod: TaxLotMethod = method || 'fifo';
    if (!VALID_METHODS.includes(taxMethod)) {
      return NextResponse.json(
        { error: 'method must be "fifo" or "lifo"' },
        { status: 400 },
      );
    }

    // Use provided transactions or fall back to mock data
    const txData = transactions && transactions.length > 0
      ? transactions
      : generateTransactions();

    const report = calculateTaxReport(txData, taxMethod, year);
    const availableYears = getAvailableYears(txData);

    return NextResponse.json({
      success: true,
      data: report,
      meta: { availableYears },
    });
  } catch (error) {
    console.error('Tax POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
