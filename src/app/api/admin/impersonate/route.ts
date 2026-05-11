import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, getAdminUser, logAdminAction } from '@/lib/admin/auth';

export async function POST(request: NextRequest) {
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

    const admin = await getAdminUser(session.user.id);
    if (!admin || admin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admins can impersonate users' }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const { data: targetUser, error: userError } = await supabase
      .from('user_profiles')
      .select('user_id, email, full_name, plan, status')
      .eq('user_id', userId)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    await logAdminAction({
      adminId: session.user.id,
      action: 'impersonate_user',
      targetType: 'user',
      targetId: userId,
      details: { target_email: targetUser.email, target_name: targetUser.full_name },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
    });

    return NextResponse.json({
      data: {
        impersonated: true,
        user: targetUser,
        adminId: session.user.id,
        message: `Impersonation session started for ${targetUser.email}`,
      },
    });
  } catch (error) {
    console.error('Admin impersonate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
