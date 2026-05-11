import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, logAdminAction } from '@/lib/admin/auth';

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

    const { data: templates, error } = await supabase
      .from('notification_templates')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      templates: templates || [],
    });
  } catch (error) {
    console.error('Admin notifications error:', error);
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

    const adminCheck = await isAdmin(session.user.id);
    if (!adminCheck) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, subject, body: templateBody, is_active, channel } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_by: session.user.id };
    if (subject !== undefined) updates.subject = subject;
    if (templateBody !== undefined) updates.body = templateBody;
    if (is_active !== undefined) updates.is_active = is_active;
    if (channel !== undefined) updates.channel = channel;

    const { error } = await supabase
      .from('notification_templates')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction({
      adminId: session.user.id,
      action: 'update_notification_template',
      targetType: 'notification_template',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin notifications update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
