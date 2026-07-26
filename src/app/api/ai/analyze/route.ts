/**
 * POST /api/ai/analyze
 *
 * Analyze transaction data with the CryptoBooks AI agent.
 * Returns charts data, insights, warnings, suggestions, and a written report.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeDataWithAgent, type AgentContext } from '@/lib/ai/agent';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import type { Client } from '@/lib/mock-data';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      context,
      transactions,
      summaryStats,
      groupedData,
      clients = [],
    }: {
      context: AgentContext;
      transactions: Array<Record<string, unknown>>;
      summaryStats: Record<string, number>;
      groupedData: Record<string, unknown>;
      clients?: Client[];
    } = body;

    // Validate required fields
    if (!context?.userId) {
      return NextResponse.json(
        { error: 'context.userId is required' },
        { status: 400 }
      );
    }

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'transactions array is required' },
        { status: 400 }
      );
    }

    if (!context.sectionType) {
      return NextResponse.json(
        { error: 'context.sectionType is required for analysis' },
        { status: 400 }
      );
    }

    // Set default plan if not provided
    if (!context.plan) {
      context.plan = 'starter';
    }

    // Calculate summary stats if not provided
    const stats = summaryStats || calculateSummaryStats(transactions);
    const groups = groupedData || calculateGroupedData(transactions, clients);

    // Call the AI agent
    const result = await analyzeDataWithAgent(context, transactions, stats, groups);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('AI Analyze API error:', error);

    // Check if it's a rate limit error
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for analysis requests. Please upgrade your plan.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process analysis request' },
      { status: 500 }
    );
  }
}

// ============================================================
// Helper: Calculate summary statistics
// ============================================================

function calculateSummaryStats(transactions: Array<Record<string, unknown>>): Record<string, number> {
  const values = transactions.map(tx => (tx.value as number) || 0);
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  const avgValue = values.length > 0 ? totalValue / values.length : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const minValue = values.length > 0 ? Math.min(...values) : 0;

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    avgValue: Math.round(avgValue * 100) / 100,
    maxValue: Math.round(maxValue * 100) / 100,
    minValue: Math.round(minValue * 100) / 100,
    count: transactions.length,
  };
}

// ============================================================
// Helper: Calculate grouped data
// ============================================================

function calculateGroupedData(
  transactions: Array<Record<string, unknown>>,
  clients: Client[] = [],
): Record<string, unknown> {
  // Group by date
  const byDateMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const date = (tx.date as string) || '';
    const key = date.length > 10 ? date.slice(0, 10) : date;
    byDateMap[key] = (byDateMap[key] || 0) + ((tx.value as number) || 0);
  });
  const byDate = Object.entries(byDateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));

  // Group by token
  const byTokenMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const token = (tx.token as string) || 'UNKNOWN';
    byTokenMap[token] = (byTokenMap[token] || 0) + ((tx.value as number) || 0);
  });
  const byToken = Object.entries(byTokenMap)
    .sort(([, a], [, b]) => b - a)
    .map(([token, value]) => ({ token, value: Math.round(value * 100) / 100 }));

  // Group by network
  const byNetworkMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const network = (tx.networkAr as string) || (tx.network as string) || 'Unknown';
    byNetworkMap[network] = (byNetworkMap[network] || 0) + ((tx.value as number) || 0);
  });
  const byNetwork = Object.entries(byNetworkMap)
    .sort(([, a], [, b]) => b - a)
    .map(([network, value]) => ({ network, value: Math.round(value * 100) / 100 }));

  // Group by counterparty — prefer named clients
  const byCounterpartyMap: Record<string, number> = {};
  transactions.forEach(tx => {
    const label = resolveCounterpartyDisplay(
      {
        counterparty: tx.counterparty as string | null | undefined,
        counterpartyLabel: tx.counterpartyLabel as string | null | undefined,
      },
      clients,
    );
    byCounterpartyMap[label] = (byCounterpartyMap[label] || 0) + ((tx.value as number) || 0);
  });
  const byCounterparty = Object.entries(byCounterpartyMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));

  return { byDate, byToken, byNetwork, byCounterparty };
}
