/**
 * Admin Authentication Helpers
 * Verifies admin access and logs admin actions
 */

import { createServerClient } from '@/lib/supabase/server';

export interface AdminUser {
  user_id: string;
  role: 'super_admin' | 'admin' | 'viewer';
  created_at: string;
}

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    return !error && !!data;
  } catch {
    return false;
  }
}

export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data as AdminUser;
  } catch {
    return null;
  }
}

export async function getAdminRole(userId: string): Promise<string | null> {
  const admin = await getAdminUser(userId);
  return admin?.role || null;
}

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from('audit_log').insert({
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      details: params.details || {},
      ip_address: params.ipAddress || null,
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

export function canPerformAction(role: string, action: string): boolean {
  const permissions: Record<string, string[]> = {
    super_admin: ['read', 'write', 'delete', 'manage_admins', 'impersonate'],
    admin: ['read', 'write', 'delete', 'impersonate'],
    viewer: ['read'],
  };

  const userPermissions = permissions[role] || [];
  return userPermissions.includes(action);
}
