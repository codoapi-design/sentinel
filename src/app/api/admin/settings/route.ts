import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, getAdminRole } from '@/lib/admin/auth';

// Default settings values
const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: 'Sentinel',
  site_description: 'Digital Wallet Monitoring Platform',
  support_email: 'support@sentinel.app',
  maintenance_mode: 'false',
  registration_enabled: 'true',
  email_verification_required: 'true',
  max_wallets_per_user: '10',
  rate_limit_window: '15',
  rate_limit_max_requests: '100',
  telegram_bot_enabled: 'true',
  email_notifications_enabled: 'true',
};

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

    // Get system statistics from actual DB
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

    // Get actual settings from DB
    const { data: dbSettings } = await supabase
      .from('system_settings')
      .select('key, value');

    // Merge DB settings with defaults
    const settingsMap: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const s of dbSettings || []) {
      settingsMap[s.key] = s.value;
    }

    // Get admin list for security section
    const { data: adminList } = await supabase
      .from('admin_users')
      .select('user_id, role, created_at')
      .order('created_at', { ascending: true });

    // Enrich with email from auth
    const enrichedAdmins = await Promise.all((adminList || []).map(async (admin) => {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('id', admin.user_id)
        .maybeSingle();
      return {
        ...admin,
        email: profile?.email || admin.user_id,
      };
    }));

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalWallets: totalWallets || 0,
        totalTransactions: totalTransactions || 0,
        adminCount: adminCount || 0,
        auditLogCount: auditLogCount || 0,
      },
      settings: settingsMap,
      adminList: enrichedAdmins,
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

    if (action === 'update' && data) {
      // Save each setting to DB via upsert
      const entries = Object.entries(data) as [string, string | boolean][];
      const upserts = entries.map(([key, value]) => ({
        key,
        value: String(value),
      }));

      const { error } = await supabase
        .from('system_settings')
        .upsert(upserts, { onConflict: 'key' });

      if (error) {
        console.error('Settings upsert error:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
      }

      // Log action
      try {
        await supabase.from('audit_log').insert({
          admin_id: session.user.id,
          action: 'settings_update',
          target_type: 'system_settings',
          details: { updatedKeys: entries.map(([k]) => k) },
        });
      } catch {}

      return NextResponse.json({ success: true, message: 'Settings saved successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin settings update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
