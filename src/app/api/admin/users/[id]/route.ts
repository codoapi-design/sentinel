import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, logAdminAction, canPerformAction, getAdminRole } from '@/lib/admin/auth';
import type { Database } from '@/lib/supabase/types';

type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update'];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminCheck = await isAdmin(session.user.id);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch user wallets
    const { data: wallets } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    // Fetch recent transactions
    const walletIds = (wallets || []).map(w => w.id);
    let transactions: unknown[] = [];
    if (walletIds.length > 0) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .in('wallet_id', walletIds)
        .order('timestamp', { ascending: false })
        .limit(50);
      transactions = txData || [];
    }

    // Fetch AI usage
    const { data: aiUsage } = await supabase
      .from('ai_usage')
      .select('*')
      .eq('user_id', id)
      .single();

    // Fetch email settings
    const { data: emailSettings } = await supabase
      .from('email_settings')
      .select('*')
      .eq('user_id', id)
      .single();

    return NextResponse.json({
      profile,
      wallets: wallets || [],
      transactions,
      aiUsage: aiUsage || null,
      emailSettings: emailSettings || null,
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getAdminRole(session.user.id);
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { plan, status, ban_reason, full_name } = body;

    // Verify permissions
    if (status === 'banned' && !canPerformAction(role, 'write')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update user profile
    const updates: UserProfileUpdate = {};
    if (plan) updates.plan = plan;
    if (status) updates.status = status;
    if (ban_reason !== undefined) updates.status = 'banned';
    if (full_name !== undefined) updates.full_name = full_name;

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the action
    await logAdminAction({
      adminId: session.user.id,
      action: `update_user_${Object.keys(updates).join('_')}`,
      targetType: 'user',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
