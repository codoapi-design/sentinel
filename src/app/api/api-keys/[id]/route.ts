import { NextRequest, NextResponse } from 'next/server';
import {
  getApiKey,
  maskApiKey,
  revokeApiKey,
  activateApiKey,
} from '@/lib/api-keys/service';
import type { ApiKeyPermission } from '@/lib/api-keys/types';

const VALID_PERMISSIONS: ApiKeyPermission[] = [
  'transactions:read',
  'wallets:read',
  'portfolio:read',
  'reports:read',
  'webhooks:manage',
];

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/api-keys/[id]
 * Get API key details (masked)
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const apiKey = getApiKey(id);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...apiKey, key: maskApiKey(apiKey.key) },
    });
  } catch (error) {
    console.error('API key GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/api-keys/[id]
 * Update API key (name, permissions, isActive)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { name, permissions, isActive } = body as {
      name?: string;
      permissions?: ApiKeyPermission[];
      isActive?: boolean;
    };

    const apiKey = getApiKey(id);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 },
      );
    }

    // Validate permissions if provided
    if (permissions) {
      const invalidPerms = permissions.filter(
        (p: string) => !VALID_PERMISSIONS.includes(p as ApiKeyPermission),
      );
      if (invalidPerms.length > 0) {
        return NextResponse.json(
          { error: `Invalid permissions: ${invalidPerms.join(', ')}` },
          { status: 400 },
        );
      }
      apiKey.permissions = permissions as ApiKeyPermission[];
    }

    if (name !== undefined) {
      apiKey.name = name;
    }

    // Handle isActive toggle
    if (isActive === true && !apiKey.isActive) {
      activateApiKey(id);
    } else if (isActive === false && apiKey.isActive) {
      revokeApiKey(id);
    }

    // Re-fetch after potential modification
    const updated = getApiKey(id);
    return NextResponse.json({
      success: true,
      data: updated ? { ...updated, key: maskApiKey(updated.key) } : null,
    });
  } catch (error) {
    console.error('API key PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/api-keys/[id]
 * Revoke (soft-delete) an API key
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const revoked = revokeApiKey(id);

    if (!revoked) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    console.error('API key DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
