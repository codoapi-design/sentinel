import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, getAdminRole, logAdminAction } from '@/lib/admin/auth';

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

    // Get system statistics
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: totalWallets } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });

    const { count: totalTransactions } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });

    const { count: adminCount } = await supabase
      .from('admin_users')
      .select('*', { count: 'exact', head: true });

    const { count: auditLogCount } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true });

    // Get rate limit stats
    const { data: rateLimits } = await supabase
      .from('rate_limits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalWallets: totalWallets || 0,
        totalTransactions: totalTransactions || 0,
        adminCount: adminCount || 0,
        auditLogCount: auditLogCount || 0,
      },
      rateLimits: rateLimits || [],
    });
  } catch (error) {
    console.error('Admin settings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getAdminRole(session.user.id);
    if (!role || role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can modify settings' }, { status: 403 });
    }

    const body = await request.json();
    const { action, data } = body;

    await logAdminAction({
      adminId: session.user.id,
      action: `settings_${action}`,
      targetType: 'settings',
      details: data,
    });

    return NextResponse.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Admin settings update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
