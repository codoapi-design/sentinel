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
    const severity = searchParams.get('severity') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('system_alerts')
      .select('*', { count: 'exact' });

    if (severity) {
      query = query.eq('severity', severity);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: alerts, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get alert stats
    const { count: criticalCount } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .eq('status', 'active');

    const { count: warningCount } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'warning')
      .eq('status', 'active');

    const { count: infoCount } = await supabase
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'info')
      .eq('status', 'active');

    // Get recent alert trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentAlerts } = await supabase
      .from('system_alerts')
      .select('severity, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const alertTrend: Record<string, { critical: number; warning: number; info: number }> = {};
    (recentAlerts || []).forEach((a) => {
      const day = new Date(a.created_at).toISOString().split('T')[0];
      if (!alertTrend[day]) alertTrend[day] = { critical: 0, warning: 0, info: 0 };
      const sev = a.severity as keyof typeof alertTrend[string];
      if (sev in alertTrend[day]) alertTrend[day][sev]++;
    });

    const alertChart = Object.entries(alertTrend).map(([date, data]) => ({
      date: date.slice(5),
      critical: data.critical,
      warning: data.warning,
      info: data.info,
    }));

    return NextResponse.json({
      alerts: alerts || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      stats: {
        critical: criticalCount || 0,
        warning: warningCount || 0,
        info: infoCount || 0,
      },
      alertChart,
    });
  } catch (error) {
    console.error('Admin alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const { action, alertId } = body;

    if (action === 'acknowledge' && alertId) {
      const { error } = await supabase
        .from('system_alerts')
        .update({ status: 'acknowledged', acknowledged_by: session.user.id, acknowledged_at: new Date().toISOString() })
        .eq('id', alertId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'resolve' && alertId) {
      const { error } = await supabase
        .from('system_alerts')
        .update({ status: 'resolved', resolved_by: session.user.id, resolved_at: new Date().toISOString() })
        .eq('id', alertId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'resolve_all') {
      const { error } = await supabase
        .from('system_alerts')
        .update({ status: 'resolved', resolved_by: session.user.id, resolved_at: new Date().toISOString() })
        .eq('status', 'active');

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin alerts action error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
