import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import {
  isAllowedAvatarValue,
  toPresetAvatarUrl,
  parsePresetAvatarId,
} from '@/lib/profile/avatars';
import { createCookieServerClient, createServerClient } from '@/lib/supabase/server';

const MAX_NAME = 80;

type ProfileRow = {
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  plan: string;
};

function resolveDisplayName(
  fullName: string | null | undefined,
  metaName: string | null | undefined,
  email: string | null | undefined,
): string {
  return fullName?.trim() || metaName?.trim() || email?.split('@')[0] || 'User';
}

function adminClient() {
  return createServerClient();
}

function normalizeStoredAvatar(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  // Drop legacy data:/http avatars — only preset:<id> is kept
  if (parsePresetAvatarId(avatarUrl)) return avatarUrl;
  return null;
}

async function findProfile(userId: string): Promise<{
  data: (ProfileRow & { user_id: string }) | null;
  error: { message: string } | null;
}> {
  const admin = adminClient();

  const full = await admin
    .from('user_profiles')
    .select('user_id, full_name, email, avatar_url, plan')
    .eq('user_id', userId)
    .maybeSingle();

  if (!full.error) {
    if (!full.data) return { data: null, error: null };
    return {
      data: {
        ...(full.data as ProfileRow & { user_id: string }),
        avatar_url: normalizeStoredAvatar(
          (full.data as ProfileRow).avatar_url,
        ),
      },
      error: null,
    };
  }

  const msg = full.error.message || '';
  if (!/avatar_url/i.test(msg)) {
    return { data: null, error: { message: msg } };
  }

  const basic = await admin
    .from('user_profiles')
    .select('user_id, full_name, email, plan')
    .eq('user_id', userId)
    .maybeSingle();

  if (basic.error) {
    return { data: null, error: { message: basic.error.message } };
  }
  if (!basic.data) return { data: null, error: null };

  return {
    data: {
      ...(basic.data as {
        user_id: string;
        full_name: string | null;
        email: string;
        plan: string;
      }),
      avatar_url: null,
    },
    error: null,
  };
}

async function createMissingProfile(
  user: User,
  fields: { full_name?: string; avatar_url?: string | null },
): Promise<{ data: ProfileRow | null; error: { message: string } | null }> {
  const admin = adminClient();
  const now = new Date().toISOString();

  const base = {
    user_id: user.id,
    email: user.email || `${user.id}@users.local`,
    full_name:
      fields.full_name ??
      (user.user_metadata?.full_name as string | undefined) ??
      '',
    plan: 'starter',
    status: 'active',
    updated_at: now,
    created_at: now,
  };

  const withAvatar = {
    ...base,
    avatar_url:
      fields.avatar_url !== undefined
        ? normalizeStoredAvatar(fields.avatar_url)
        : normalizeStoredAvatar(user.user_metadata?.avatar_url as string | undefined),
  };

  let result = await admin
    .from('user_profiles')
    .insert(withAvatar as never)
    .select('full_name, email, avatar_url, plan')
    .single();

  if (!result.error && result.data) {
    return { data: result.data as ProfileRow, error: null };
  }

  if (result.error && /avatar_url/i.test(result.error.message)) {
    result = await admin
      .from('user_profiles')
      .insert(base as never)
      .select('full_name, email, plan')
      .single();

    if (!result.error && result.data) {
      const row = result.data as { full_name: string | null; email: string; plan: string };
      return { data: { ...row, avatar_url: withAvatar.avatar_url }, error: null };
    }
  }

  if (result.error && /null value in column ["']?id["']?/i.test(result.error.message)) {
    result = await admin
      .from('user_profiles')
      .insert({ ...withAvatar, id: user.id } as never)
      .select('full_name, email, avatar_url, plan')
      .single();

    if (!result.error && result.data) {
      return { data: result.data as ProfileRow, error: null };
    }
  }

  return {
    data: null,
    error: { message: result.error?.message || 'Failed to create profile' },
  };
}

async function syncAuthProfileMetadata(
  cookieClient: Awaited<ReturnType<typeof createCookieServerClient>>,
  admin: ReturnType<typeof createServerClient>,
  userId: string,
  opts: { fullName?: string },
) {
  const meta: Record<string, string | null> = {
    // Always clear legacy blob avatars from auth metadata
    avatar_url: null,
  };
  if (opts.fullName !== undefined) meta.full_name = opts.fullName;

  try {
    const { error: adminErr } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: meta,
    });
    if (!adminErr) return;
    console.warn('[API /profile] admin metadata sync failed', adminErr.message);
  } catch (err) {
    console.warn('[API /profile] admin metadata sync threw', err);
  }

  if (opts.fullName === undefined) return;
  const { error: authErr } = await cookieClient.auth.updateUser({
    data: { full_name: opts.fullName, avatar_url: null },
  });
  if (authErr) {
    console.warn('[API /profile] cookie metadata sync failed', authErr.message);
  }
}

/**
 * GET /api/profile — current user display profile
 * PATCH /api/profile — update full_name and/or preset avatar
 */
export async function GET() {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let { data: profile, error } = await findProfile(user.id);
    if (error) {
      console.error('[API /profile GET] lookup failed', error);
    }

    if (!profile) {
      const created = await createMissingProfile(user, {});
      if (created.data) profile = { ...created.data, user_id: user.id };
      else if (created.error) {
        console.warn('[API /profile GET] ensure profile failed', created.error.message);
      }
    }

    // Strip legacy data: avatar from auth metadata if still present
    const metaAvatar = user.user_metadata?.avatar_url as string | undefined;
    if (typeof metaAvatar === 'string' && (metaAvatar.startsWith('data:') || metaAvatar.length > 200)) {
      await syncAuthProfileMetadata(cookieClient, adminClient(), user.id, {});
    }

    const fullName = resolveDisplayName(
      profile?.full_name,
      user.user_metadata?.full_name,
      profile?.email || user.email,
    );

    return NextResponse.json({
      fullName,
      email: profile?.email || user.email || '',
      avatarUrl: normalizeStoredAvatar(profile?.avatar_url),
      plan: profile?.plan || 'free',
    });
  } catch (error) {
    console.error('[API /profile GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const updates: { full_name?: string; avatar_url?: string | null } = {};

    if (typeof body.fullName === 'string') {
      const name = body.fullName.trim();
      if (!name) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      if (name.length > MAX_NAME) {
        return NextResponse.json({ error: `Name must be at most ${MAX_NAME} characters` }, { status: 400 });
      }
      updates.full_name = name;
    }

    if (body.avatarUrl === null || body.avatarUrl === '') {
      updates.avatar_url = null;
    } else if (typeof body.avatarUrl === 'string') {
      const raw = body.avatarUrl.trim();
      // Accept preset id or preset:<id>
      const asPreset = raw.startsWith('preset:') ? raw : toPresetAvatarUrl(raw);
      if (!isAllowedAvatarValue(asPreset)) {
        return NextResponse.json(
          { error: 'Only built-in avatar presets are allowed' },
          { status: 400 },
        );
      }
      updates.avatar_url = asPreset;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await findProfile(user.id);
    if (existingError) {
      console.error('[API /profile PATCH] lookup failed', existingError);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    let updated: ProfileRow | null = null;
    const admin = adminClient();

    if (existing) {
      const { data, error } = await admin
        .from('user_profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select('full_name, email, avatar_url, plan')
        .single();

      if (error && /avatar_url/i.test(error.message) && updates.full_name !== undefined) {
        const retry = await admin
          .from('user_profiles')
          .update({
            full_name: updates.full_name,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .select('full_name, email, plan')
          .single();

        if (retry.error) {
          return NextResponse.json(
            { error: retry.error.message || 'Failed to update profile' },
            { status: 500 },
          );
        }
        const row = retry.data as { full_name: string | null; email: string; plan: string };
        updated = { ...row, avatar_url: updates.avatar_url ?? null };
      } else if (error) {
        return NextResponse.json(
          { error: error.message || 'Failed to update profile' },
          { status: 500 },
        );
      } else {
        updated = data as ProfileRow;
      }
    } else {
      const created = await createMissingProfile(user, updates);
      if (created.error || !created.data) {
        await syncAuthProfileMetadata(cookieClient, admin, user.id, {
          fullName: updates.full_name,
        });
        return NextResponse.json(
          {
            error:
              created.error?.message ||
              'Could not create profile row. Your account may need a DB migration.',
          },
          { status: 500 },
        );
      }
      updated = created.data;
    }

    await syncAuthProfileMetadata(cookieClient, admin, user.id, {
      fullName: updates.full_name,
    });

    const fullName = resolveDisplayName(
      updated.full_name,
      user.user_metadata?.full_name,
      updated.email || user.email,
    );

    return NextResponse.json({
      fullName,
      email: updated.email || user.email || '',
      avatarUrl: normalizeStoredAvatar(updated.avatar_url),
      plan: updated.plan || 'free',
    });
  } catch (error) {
    console.error('[API /profile PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
