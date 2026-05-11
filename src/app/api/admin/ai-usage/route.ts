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

    // Get AI usage data
    const { data: usageData, count, error } = await supabase
      .from('ai_usage')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate AI stats
    const { data: allUsage } = await supabase
      .from('ai_usage')
      .select('chat_count, analysis_count, total_input_tokens, total_output_tokens');

    const totalChats = (allUsage || []).reduce((sum, u) => sum + (u.chat_count || 0), 0);
    const totalAnalyses = (allUsage || []).reduce((sum, u) => sum + (u.analysis_count || 0), 0);
    const totalInputTokens = (allUsage || []).reduce((sum, u) => sum + (u.total_input_tokens || 0), 0);
    const totalOutputTokens = (allUsage || []).reduce((sum, u) => sum + (u.total_output_tokens || 0), 0);

    // Get usage by day for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyData } = await supabase
      .from('ai_usage')
      .select('created_at, chat_count, analysis_count')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const dailyMap: Record<string, { chats: number; analyses: number }> = {};
    (dailyData || []).forEach((d) => {
      const day = new Date(d.created_at).toISOString().split('T')[0];
      if (!dailyMap[day]) {
        dailyMap[day] = { chats: 0, analyses: 0 };
      }
      dailyMap[day].chats += d.chat_count || 0;
      dailyMap[day].analyses += d.analysis_count || 0;
    });

    const usageChart = Object.entries(dailyMap).map(([date, data]) => ({
      date: date.slice(5),
      chats: data.chats,
      analyses: data.analyses,
    }));

    // Top users by usage
    const { data: topUsers } = await supabase
      .from('ai_usage')
      .select('user_id, chat_count, analysis_count, total_input_tokens, total_output_tokens')
      .order('chat_count', { ascending: false })
      .limit(10);

    return NextResponse.json({
      usage: usageData || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      stats: {
        totalChats,
        totalAnalyses,
        totalInputTokens,
        totalOutputTokens,
        estimatedCost: (totalInputTokens * 0.000003 + totalOutputTokens * 0.000015).toFixed(2),
      },
      usageChart,
      topUsers: topUsers || [],
    });
  } catch (error) {
    console.error('Admin AI usage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
