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
    const range = searchParams.get('range') || '30d';

    // Calculate date range
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[range] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // ===== User Analytics =====
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    const { count: newUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString());

    const { count: activeUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // User growth by day
    const { data: userProfiles } = await supabase
      .from('user_profiles')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    const userGrowthMap: Record<string, number> = {};
    (userProfiles || []).forEach((p) => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      userGrowthMap[date] = (userGrowthMap[date] || 0) + 1;
    });

    const userGrowth: Array<{ date: string; new: number; cumulative: number }> = [];
    let cumulative = (totalUsers || 0) - (userProfiles?.length || 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const newCount = userGrowthMap[key] || 0;
      cumulative += newCount;
      userGrowth.push({ date: key.slice(5), new: newCount, cumulative });
    }

    // ===== Revenue Analytics =====
    const { count: proUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'pro');

    const { count: enterpriseUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('plan', 'enterprise');

    const mrr = (proUsers || 0) * 29 + (enterpriseUsers || 0) * 99;
    const arr = mrr * 12;

    // Revenue by plan
    const revenueByPlan = [
      { plan: 'Starter', revenue: 0, users: (totalUsers || 0) - (proUsers || 0) - (enterpriseUsers || 0) },
      { plan: 'Pro', revenue: (proUsers || 0) * 29, users: proUsers || 0 },
      { plan: 'Enterprise', revenue: (enterpriseUsers || 0) * 99, users: enterpriseUsers || 0 },
    ];

    // ===== Wallet Analytics =====
    const { count: totalWallets } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });

    const { data: positionData } = await supabase
      .from('asset_positions')
      .select('chain');

    const networkMap: Record<string, number> = {};
    (positionData || []).forEach((p) => {
      const chain = p.chain || 'unknown';
      networkMap[chain] = (networkMap[chain] || 0) + 1;
    });

    const walletNetworks = Object.entries(networkMap).map(([network, count]) => ({
      network,
      count,
    })).sort((a, b) => b.count - a.count);

    // ===== Transaction Analytics =====
    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    const { data: txData } = await supabase
      .from('transactions')
      .select('created_at, type')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    const txGrowthMap: Record<string, { count: number; sent: number; received: number }> = {};
    (txData || []).forEach((t) => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      if (!txGrowthMap[date]) txGrowthMap[date] = { count: 0, sent: 0, received: 0 };
      txGrowthMap[date].count++;
      if (t.type === 'send' || t.type === 'sent') txGrowthMap[date].sent++;
      else txGrowthMap[date].received++;
    });

    const transactionGrowth = Object.entries(txGrowthMap).map(([date, data]) => ({
      date: date.slice(5),
      ...data,
    }));

    // ===== AI Analytics =====
    const { data: aiUsageData } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, total_input_tokens, total_output_tokens, created_at')
      .gte('created_at', startDate.toISOString());

    const totalChats = (aiUsageData || []).reduce((sum, u) => sum + (u.chat_count || 0), 0);
    const totalAnalyses = (aiUsageData || []).reduce((sum, u) => sum + (u.analysis_count || 0), 0);
    const totalInputTokens = (aiUsageData || []).reduce((sum, u) => sum + (u.total_input_tokens || 0), 0);
    const totalOutputTokens = (aiUsageData || []).reduce((sum, u) => sum + (u.total_output_tokens || 0), 0);
    const estimatedCost = ((totalInputTokens * 0.000003) + (totalOutputTokens * 0.000015)).toFixed(2);

    // AI usage by day
    const aiGrowthMap: Record<string, { chats: number; analyses: number }> = {};
    (aiUsageData || []).forEach((u) => {
      const date = new Date(u.created_at).toISOString().split('T')[0];
      if (!aiGrowthMap[date]) aiGrowthMap[date] = { chats: 0, analyses: 0 };
      aiGrowthMap[date].chats += u.chat_count || 0;
      aiGrowthMap[date].analyses += u.analysis_count || 0;
    });

    const aiGrowth = Object.entries(aiGrowthMap).map(([date, data]) => ({
      date: date.slice(5),
      ...data,
    }));

    // ===== Engagement Metrics =====
    const avgWalletsPerUser = totalUsers ? ((totalWallets || 0) / totalUsers).toFixed(1) : '0';
    const avgTxPerUser = totalUsers ? ((totalTransactions || 0) / totalUsers).toFixed(1) : '0';
    const paidUserPercentage = totalUsers ? Math.round(((proUsers || 0) + (enterpriseUsers || 0)) / totalUsers * 100) : 0;
    const activeUserPercentage = totalUsers ? Math.round((activeUsers || 0) / totalUsers * 100) : 0;

    return NextResponse.json({
      users: {
        total: totalUsers || 0,
        new: newUsers || 0,
        active: activeUsers || 0,
        growth: userGrowth,
        engagement: {
          avgWalletsPerUser,
          avgTxPerUser,
          paidUserPercentage,
          activeUserPercentage,
        },
      },
      revenue: {
        mrr,
        arr,
        byPlan: revenueByPlan,
      },
      wallets: {
        total: totalWallets || 0,
        networks: walletNetworks,
      },
      transactions: {
        total: totalTransactions || 0,
        growth: transactionGrowth,
      },
      ai: {
        totalChats,
        totalAnalyses,
        totalInputTokens,
        totalOutputTokens,
        estimatedCost,
        growth: aiGrowth,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
