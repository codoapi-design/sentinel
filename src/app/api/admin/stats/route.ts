import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin/auth';

export async function GET() {
  try {
    const supabase = createServerClient();

    // Verify session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminCheck = await isAdmin(session.user.id);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // User statistics
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: starterUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'starter');

    const { count: proUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'pro');

    const { count: enterpriseUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'enterprise');

    // Wallets
    const { count: totalWallets } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });

    // Transactions
    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    // Recent signups
    const { data: recentSignups } = await supabase
      .from('user_profiles')
      .select('email, created_at, plan')
      .order('created_at', { ascending: false })
      .limit(10);

    // AI usage
    const { data: aiUsageData } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count');

    const aiChatsTotal = (aiUsageData || []).reduce((sum, u) => sum + (u.chat_count || 0), 0);
    const aiAnalysesTotal = (aiUsageData || []).reduce((sum, u) => sum + (u.analysis_count || 0), 0);

    // User growth (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: allProfiles } = await supabase
      .from('user_profiles')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    // Group by day
    const growthMap: Record<string, number> = {};
    (allProfiles || []).forEach((p) => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      growthMap[date] = (growthMap[date] || 0) + 1;
    });

    // Convert to cumulative array
    const userGrowth: Array<{ date: string; count: number }> = [];
    let cumulative = (totalUsers || 0) - (allProfiles?.length || 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      cumulative += (growthMap[key] || 0);
      userGrowth.push({ date: key.slice(5), count: cumulative });
    }

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalWallets: totalWallets || 0,
      totalTransactions: totalTransactions || 0,
      starterUsers: starterUsers || 0,
      proUsers: proUsers || 0,
      enterpriseUsers: enterpriseUsers || 0,
      usersGrowth: allProfiles && allProfiles.length > 0
        ? Math.round((allProfiles.length / Math.max((totalUsers || 1) - allProfiles.length, 1)) * 100)
        : 0,
      recentSignups: recentSignups || [],
      userGrowth,
      aiChatsTotal,
      aiAnalysesTotal,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
