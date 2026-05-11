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
    const plan = searchParams.get('plan') || '';
    const status = searchParams.get('status') || '';

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('user_profiles')
      .select('*', { count: 'exact' });

    if (plan) {
      query = query.eq('plan', plan);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: users, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get plan distribution stats
    const { count: starterCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'starter');

    const { count: proCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'pro');

    const { count: enterpriseCount } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'enterprise');

    // Get subscription data over last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const { data: recentUsers } = await supabase
      .from('user_profiles')
      .select('plan, created_at')
      .gte('created_at', twelveMonthsAgo.toISOString())
      .order('created_at', { ascending: true });

    const monthlyData: Record<string, { starter: number; pro: number; enterprise: number }> = {};
    (recentUsers || []).forEach((u) => {
      const month = new Date(u.created_at).toISOString().slice(0, 7);
      if (!monthlyData[month]) {
        monthlyData[month] = { starter: 0, pro: 0, enterprise: 0 };
      }
      const userPlan = u.plan as keyof typeof monthlyData[string];
      if (userPlan in monthlyData[month]) {
        monthlyData[month][userPlan]++;
      }
    });

    const planChart = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      starter: data.starter,
      pro: data.pro,
      enterprise: data.enterprise,
      total: data.starter + data.pro + data.enterprise,
    }));

    return NextResponse.json({
      subscriptions: users || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      stats: {
        starter: starterCount || 0,
        pro: proCount || 0,
        enterprise: enterpriseCount || 0,
      },
      planChart,
    });
  } catch (error) {
    console.error('Admin subscriptions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
