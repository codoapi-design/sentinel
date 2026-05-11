import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminCheck = await isAdmin(session.user.id);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get API keys with usage stats
    const { data: apiKeys, count, error } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate stats
    const { count: totalKeys } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true });

    const { count: activeKeys } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: expiredKeys } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString());

    // Get usage in last 24h
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);

    const { data: recentUsage } = await supabase
      .from('api_key_usage')
      .select('api_key_id, endpoint, status_code, created_at')
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    // Usage by endpoint
    const endpointUsage: Record<string, number> = {};
    (recentUsage || []).forEach((u) => {
      endpointUsage[u.endpoint] = (endpointUsage[u.endpoint] || 0) + 1;
    });

    const topEndpoints = Object.entries(endpointUsage)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Error rate
    const errorCount = (recentUsage || []).filter(u => u.status_code >= 400).length;
    const totalRequests = (recentUsage || []).length;
    const errorRate = totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : '0';

    // Usage by hour (last 24h)
    const hourlyUsage: Record<string, { total: number; errors: number }> = {};
    (recentUsage || []).forEach((u) => {
      const hour = new Date(u.created_at).toISOString().slice(0, 13);
      if (!hourlyUsage[hour]) hourlyUsage[hour] = { total: 0, errors: 0 };
      hourlyUsage[hour].total++;
      if (u.status_code >= 400) hourlyUsage[hour].errors++;
    });

    const usageChart = Object.entries(hourlyUsage).map(([hour, data]) => ({
      hour: hour.slice(11),
      total: data.total,
      errors: data.errors,
    }));

    return NextResponse.json({
      apiKeys: apiKeys || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      stats: {
        totalKeys: totalKeys || 0,
        activeKeys: activeKeys || 0,
        expiredKeys: expiredKeys || 0,
        requests24h: totalRequests,
        errorRate: parseFloat(errorRate),
      },
      topEndpoints,
      usageChart,
      recentUsage: recentUsage || [],
    });
  } catch (error) {
    console.error('Admin API monitoring error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
