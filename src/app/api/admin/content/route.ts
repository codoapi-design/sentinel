import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin, logAdminAction } from '@/lib/admin/auth';
import type { Database } from '@/lib/supabase/types';

type ContentPageUpdate = Database['public']['Tables']['content_pages']['Update'];
type ContentPageInsert = Database['public']['Tables']['content_pages']['Insert'];

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

    // Get all content pages
    const { data: content, error } = await supabase
      .from('content_pages')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      content: content || [],
    });
  } catch (error) {
    console.error('Admin content error:', error);
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
    const { id, title, content: pageContent, slug, is_published, meta_description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
    }

    const updates: ContentPageUpdate = {};
    if (title !== undefined) updates.title = title;
    if (pageContent !== undefined) updates.content = pageContent;
    if (slug !== undefined) updates.slug = slug;
    if (is_published !== undefined) updates.status = is_published ? 'published' : 'draft';
    if (meta_description !== undefined) updates.content = pageContent || updates.content;

    const { error } = await supabase
      .from('content_pages')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction({
      adminId: session.user.id,
      action: 'update_content',
      targetType: 'content',
      targetId: id,
      details: updates,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin content update error:', error);
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
    const { title, slug, content: pageContent, meta_description } = body;

    if (!title || !slug) {
      return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
    }

    const insertData: ContentPageInsert = {
        title,
        slug,
        content: pageContent || '',
        status: 'draft',
        author: session.user.id,
      };

    const { data, error } = await supabase
      .from('content_pages')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction({
      adminId: session.user.id,
      action: 'create_content',
      targetType: 'content',
      targetId: data.id,
      details: { title, slug },
    });

    return NextResponse.json({ success: true, content: data });
  } catch (error) {
    console.error('Admin content create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('content_pages')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction({
      adminId: session.user.id,
      action: 'delete_content',
      targetType: 'content',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin content delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
