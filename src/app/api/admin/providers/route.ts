import { NextRequest, NextResponse } from 'next/server';
import { createCookieServerClient } from '@/lib/supabase/server';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getApiKey, getResolvedEnvKeyName, maskApiKey } from '@/lib/env';

// ────────────────────────────────────────────────────────────
// Provider metadata: roles, limits, pricing
// ────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, {
  name: string;
  role: string;
  chains: string;
  envKey: string;
  baseUrl: string;
  freeQuota: number;
  paidQuota: number;
  costPerCall: number;
  color: string;
  icon: string;
}> = {
  covalent: {
    name: 'Covalent (GoldRush)',
    role: 'Historical Transactions, NFT Portfolios',
    chains: '100+ chains (ETH, Base, Arb, OP, Polygon, BSC, ...)',
    envKey: 'COVALENT_API_KEY',
    baseUrl: 'https://api.covalenthq.com/v1',
    freeQuota: 40000,
    paidQuota: 200000,
    costPerCall: 0.002,
    color: '#627eea',
    icon: 'database',
  },
  zerion: {
    name: 'Zerion API',
    role: 'Current Balances, DeFi Positions, PnL',
    chains: '38+ chains (ETH, Base, Arb, OP, Polygon, ...)',
    envKey: 'ZERION_API_KEY',
    baseUrl: 'https://api.zerion.io/v1',
    freeQuota: 50000,
    paidQuota: 500000,
    costPerCall: 0.001,
    color: '#0052ff',
    icon: 'wallet',
  },
  alchemy: {
    name: 'Alchemy Enhanced API',
    role: 'Real-time Transfers, Webhooks, Transaction Classification',
    chains: '5 chains (ETH, Base, Arb, OP, Polygon)',
    envKey: 'ALCHEMY_API_KEY',
    baseUrl: 'https://eth-mainnet.g.alchemy.com/v2',
    freeQuota: 300000,
    paidQuota: 1500000,
    costPerCall: 0.0005,
    color: '#6e3afa',
    icon: 'zap',
  },
  debank: {
    name: 'DeBank API',
    role: 'Complex DeFi Protocol Details (Uniswap V3, etc.)',
    chains: '60+ chains (All major EVM + Solana)',
    envKey: 'DEBANK_API_KEY',
    baseUrl: 'https://pro-openapi.debank.com/v1',
    freeQuota: 10000,
    paidQuota: 100000,
    costPerCall: 0.003,
    color: '#0ecb81',
    icon: 'layers',
  },
};

/**
 * GET /api/admin/providers
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createCookieServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'monthly';

    // ── Get runtime health from ProviderManager ──
    let runtimeHealth: any[] = [];
    try {
      const providerManager = getProviderManager();
      runtimeHealth = providerManager.getAllProviderHealth();
    } catch {
      // ProviderManager may not be available during build
    }

    // ── Get persistent health from DB ──
    const { data: dbHealth } = await supabase
      .from('provider_health')
      .select('*');

    // ── Get costs from DB ──
    const { data: costData } = await supabase
      .from('provider_costs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    // ── Build provider details ──
    const providers = Object.entries(PROVIDER_META).map(([key, meta]) => {
      const runtime = runtimeHealth.find((r: any) => r.provider === key);
      const db = (dbHealth as any[])?.find((d: any) => d.provider === key);

      // Check if API key is configured using the env resolver
      const apiKeyValue = getApiKey(key);
      const apiKeyConfigured = apiKeyValue !== '';
      const resolvedKeyName = getResolvedEnvKeyName(key);
      const apiKeyMasked = apiKeyConfigured ? maskApiKey(apiKeyValue) : null;

      // Aggregate costs
      const providerCosts = ((costData as any[]) || []).filter((c: any) => c.provider === key);
      const totalCostUsd = providerCosts.reduce((sum: number, c: any) => sum + parseFloat(c.cost_usd || '0'), 0);
      const totalRequests = providerCosts.length;
      const totalRecords = providerCosts.reduce((sum: number, c: any) => sum + (c.records_fetched || 0), 0);

      const usagePercent = Math.min(100, (totalRequests / meta.freeQuota) * 100);
      const remainingQuota = Math.max(0, meta.freeQuota - totalRequests);

      const now = new Date();
      let periodStart: Date;
      if (period === 'daily') {
        periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (period === 'weekly') {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const periodCosts = providerCosts.filter((c: any) => new Date(c.created_at) >= periodStart);
      const periodCostUsd = periodCosts.reduce((sum: number, c: any) => sum + parseFloat(c.cost_usd || '0'), 0);
      const periodRequests = periodCosts.length;

      return {
        id: key,
        name: meta.name,
        role: meta.role,
        chains: meta.chains,
        color: meta.color,
        icon: meta.icon,
        baseUrl: meta.baseUrl,

        apiKey: {
          configured: apiKeyConfigured,
          masked: apiKeyMasked,
          envKey: meta.envKey,
          resolvedKey: resolvedKeyName,
        },

        health: {
          isAvailable: runtime?.isAvailable ?? (db?.is_available ?? apiKeyConfigured),
          latencyMs: runtime?.latencyMs ?? (db?.latency_ms ?? null),
          errorCount: runtime?.errorCount ?? (db?.error_count ?? 0),
          lastChecked: db?.last_checked_at || null,
          lastError: db?.last_error || null,
          rateLimitRemaining: runtime?.rateLimitRemaining ?? (db?.rate_limit_remaining ?? null),
        },

        quota: {
          freeQuota: meta.freeQuota,
          paidQuota: meta.paidQuota,
          totalRequests,
          remainingQuota,
          usagePercent: Math.round(usagePercent * 10) / 10,
          costPerCall: meta.costPerCall,
        },

        costs: {
          totalCostUsd: Math.round(totalCostUsd * 100) / 100,
          totalRecords,
          period,
          periodCostUsd: Math.round(periodCostUsd * 100) / 100,
          periodRequests,
        },
      };
    });

    const summary = {
      totalProviders: providers.length,
      configuredProviders: providers.filter(p => p.apiKey.configured).length,
      availableProviders: providers.filter(p => p.health.isAvailable).length,
      degradedProviders: providers.filter(p => !p.health.isAvailable && p.apiKey.configured).length,
      unconfiguredProviders: providers.filter(p => !p.apiKey.configured).length,
      totalCostUsd: Math.round(providers.reduce((sum, p) => sum + p.costs.totalCostUsd, 0) * 100) / 100,
      totalRequests: providers.reduce((sum, p) => sum + p.quota.totalRequests, 0),
    };

    return NextResponse.json({ success: true, data: { providers, summary } });
  } catch (error) {
    console.error('[AdminProviders] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/providers
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createCookieServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, provider } = body as {
      action?: 'reset_health' | 'test_provider';
      provider?: string;
    };

    const validProviders = Object.keys(PROVIDER_META);

    if (!action || !provider) {
      return NextResponse.json({ error: 'action and provider are required' }, { status: 400 });
    }

    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: `Invalid provider. Must be: ${validProviders.join(', ')}` }, { status: 400 });
    }

    if (action === 'reset_health') {
      await supabase
        .from('provider_health')
        .update({ is_available: true, error_count: 0, last_error: null })
        .eq('provider', provider);

      return NextResponse.json({ success: true, message: `${provider} health reset` });
    }

    if (action === 'test_provider') {
      const startTime = Date.now();
      let isReachable = false;
      let latencyMs = 0;
      let errorDetail = '';
      let responseDetails: Record<string, unknown> = {};

      try {
        switch (provider) {
          case 'covalent': {
            const covalentKey = getApiKey('covalent');
            if (!covalentKey) throw new Error('API key not configured');
            const auth = 'Basic ' + Buffer.from(covalentKey + ':').toString('base64');
            const res = await fetch('https://api.covalenthq.com/v1/1/block_v2/latest/', {
              headers: { Authorization: auth },
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.ok;
            if (!isReachable) errorDetail = `HTTP ${res.status}`;
            try { responseDetails = await res.json(); } catch {}
            break;
          }
          case 'zerion': {
            const zerionKey = getApiKey('zerion');
            if (!zerionKey) throw new Error('API key not configured');
            const auth = `Basic ${Buffer.from(zerionKey + ':').toString('base64')}`;
            const res = await fetch('https://api.zerion.io/v1/wallets/0x0000000000000000000000000000000000000000/positions?currency=usd&filter[positions]=only_with_fungible', {
              headers: { Authorization: auth, Accept: 'application/json' },
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.status !== 0;
            if (res.status >= 400 && res.status !== 404) {
              errorDetail = `HTTP ${res.status}`;
              isReachable = false;
            }
            try { responseDetails = await res.json(); } catch {}
            break;
          }
          case 'alchemy': {
            const alchemyKey = getApiKey('alchemy');
            if (!alchemyKey) throw new Error('API key not configured');
            const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.ok;
            if (!isReachable) errorDetail = `HTTP ${res.status}`;
            try { responseDetails = await res.json(); } catch {}
            break;
          }
          case 'debank': {
            const debankKey = getApiKey('debank');
            if (!debankKey) throw new Error('API key not configured');
            const res = await fetch('https://pro-openapi.debank.com/v1/user/total_balance?id=0x0000000000000000000000000000000000000000', {
              headers: { AccessKey: debankKey },
              signal: AbortSignal.timeout(10000),
            });
            isReachable = res.status !== 0;
            if (res.status >= 400 && res.status !== 404) {
              errorDetail = `HTTP ${res.status}`;
              isReachable = false;
            }
            try { responseDetails = await res.json(); } catch {}
            break;
          }
        }
        latencyMs = Date.now() - startTime;
      } catch (testError) {
        latencyMs = Date.now() - startTime;
        isReachable = false;
        errorDetail = testError instanceof Error ? testError.message : String(testError);
      }

      // Update DB health with upsert
      await supabase
        .from('provider_health')
        .upsert({
          provider,
          is_available: isReachable,
          latency_ms: latencyMs,
          last_checked_at: new Date().toISOString(),
          error_count: isReachable ? 0 : 1,
          last_error: isReachable ? null : errorDetail,
        } as any, { onConflict: 'provider' });

      return NextResponse.json({
        success: true,
        data: {
          provider,
          isReachable,
          latencyMs,
          errorDetail: isReachable ? null : errorDetail,
          responseDetails,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[AdminProviders] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
