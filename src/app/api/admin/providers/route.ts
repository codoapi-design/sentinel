import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getProviderManager } from '@/lib/blockchain/provider-manager';

/**
 * GET /api/admin/providers
 *
 * Get health status and cost information for all blockchain data providers.
 * Admin-only endpoint.
 *
 * Query params:
 * - include_costs: Include cost data (default: true)
 * - period: Cost period 'daily' | 'weekly' | 'monthly' (default: monthly)
 */
export async function GET(request: NextRequest) {
  try {
    // ── Authenticate & verify admin ──
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // Check admin role
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 },
      );
    }

    // ── Parse query params ──
    const { searchParams } = new URL(request.url);
    const includeCosts = searchParams.get('include_costs') !== 'false';
    const period = searchParams.get('period') || 'monthly';

    // ── Get provider health from ProviderManager ──
    const providerManager = getProviderManager();
    const healthStatus = providerManager.getAllProviderHealth();

    // ── Get provider health from DB (persistent) ──
    const { data: dbHealth } = await supabase
      .from('provider_health')
      .select('*');

    // ── Merge runtime health with DB health ──
    const mergedHealth = healthStatus.map(runtime => {
      const dbEntry = dbHealth?.find(d => d.provider === runtime.provider);
      return {
        provider: runtime.provider,
        isAvailable: runtime.isAvailable,
        lastChecked: runtime.lastChecked,
        latencyMs: runtime.latencyMs,
        errorCount: runtime.errorCount,
        rateLimitRemaining: runtime.rateLimitRemaining,
        dbLastChecked: dbEntry?.last_checked_at || null,
        dbErrorCount: dbEntry?.error_count || 0,
        dbLastError: dbEntry?.last_error || null,
      };
    });

    // ── Build response ──
    const response: Record<string, unknown> = {
      providers: mergedHealth,
      summary: {
        totalProviders: healthStatus.length,
        availableProviders: healthStatus.filter(p => p.isAvailable).length,
        degradedProviders: healthStatus.filter(p => !p.isAvailable).length,
      },
    };

    // ── Include cost data if requested ──
    if (includeCosts) {
      const { data: costData } = await supabase
        .from('provider_costs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      // Aggregate costs by provider
      const costByProvider: Record<string, { totalCostUsd: number; totalRequests: number; totalRecords: number }> = {};
      for (const cost of costData || []) {
        if (!costByProvider[cost.provider]) {
          costByProvider[cost.provider] = { totalCostUsd: 0, totalRequests: 0, totalRecords: 0 };
        }
        costByProvider[cost.provider].totalCostUsd += parseFloat(cost.cost_usd || '0');
        costByProvider[cost.provider].totalRequests++;
        costByProvider[cost.provider].totalRecords += cost.records_fetched || 0;
      }

      response.costs = costByProvider;
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    console.error('[AdminProviders] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/providers
 *
 * Admin actions for provider management:
 * - reset_health: Reset a provider's error count and mark as available
 * - test_provider: Test connectivity to a specific provider
 *
 * Body:
 * - action: 'reset_health' | 'test_provider'
 * - provider: 'covalent' | 'zerion' | 'alchemy' | 'debank'
 */
export async function POST(request: NextRequest) {
  try {
    // ── Authenticate & verify admin ──
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { action, provider } = body as {
      action?: 'reset_health' | 'test_provider';
      provider?: string;
    };

    const validProviders = ['covalent', 'zerion', 'alchemy', 'debank'];

    if (!action || !provider) {
      return NextResponse.json(
        { error: 'action and provider are required' },
        { status: 400 },
      );
    }

    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 },
      );
    }

    if (action === 'reset_health') {
      // Reset in DB
      await supabase
        .from('provider_health')
        .update({
          is_available: true,
          error_count: 0,
          last_error: null,
        })
        .eq('provider', provider);

      return NextResponse.json({
        success: true,
        message: `${provider} health status reset successfully`,
      });
    }

    if (action === 'test_provider') {
      // Quick connectivity test
      const startTime = Date.now();
      let isReachable = false;
      let latencyMs = 0;
      let errorDetail = '';

      try {
        switch (provider) {
          case 'covalent': {
            if (!process.env.COVALENT_API_KEY) throw new Error('API key not configured');
            const auth = 'Basic ' + Buffer.from(process.env.COVALENT_API_KEY + ':').toString('base64');
            const res = await fetch('https://api.covalenthq.com/v1/1/block_v2/latest/', {
              headers: { Authorization: auth },
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.ok;
            if (!res.ok) errorDetail = `HTTP ${res.status}`;
            break;
          }
          case 'zerion': {
            if (!process.env.ZERION_API_KEY) throw new Error('API key not configured');
            const auth = `Basic ${Buffer.from(process.env.ZERION_API_KEY + ':').toString('base64')}`;
            const res = await fetch('https://api.zerion.io/v1/health/', {
              headers: { Authorization: auth },
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.ok;
            if (!res.ok) errorDetail = `HTTP ${res.status}`;
            break;
          }
          case 'alchemy': {
            if (!process.env.ALCHEMY_API_KEY) throw new Error('API key not configured');
            const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.ok;
            if (!res.ok) errorDetail = `HTTP ${res.status}`;
            break;
          }
          case 'debank': {
            if (!process.env.DEBANK_API_KEY) throw new Error('API key not configured');
            const res = await fetch(`https://pro-openapi.debank.com/v1/user/total_balance?id=0x0000000000000000000000000000000000000000`, {
              headers: { AccessKey: process.env.DEBANK_API_KEY },
              signal: AbortSignal.timeout(10000),
            });
            // DeBank may return 200 even for zero address, just check connectivity
            isReachable = res.status !== 0;
            break;
          }
        }
        latencyMs = Date.now() - startTime;
      } catch (testError) {
        latencyMs = Date.now() - startTime;
        isReachable = false;
        errorDetail = String(testError);
      }

      // Update DB health
      await supabase
        .from('provider_health')
        .update({
          is_available: isReachable,
          latency_ms: latencyMs,
          last_checked_at: new Date().toISOString(),
          error_count: isReachable ? 0 : undefined,
          last_error: isReachable ? null : errorDetail,
        })
        .eq('provider', provider);

      return NextResponse.json({
        success: true,
        data: {
          provider,
          isReachable,
          latencyMs,
          errorDetail: isReachable ? null : errorDetail,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: reset_health, test_provider' },
      { status: 400 },
    );
  } catch (error) {
    console.error('[AdminProviders] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
