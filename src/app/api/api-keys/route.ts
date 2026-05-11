import { NextRequest, NextResponse } from 'next/server';
import {
  listApiKeys,
  generateApiKey,
  maskApiKey,
} from '@/lib/api-keys/service';
import type { ApiKeyPermission } from '@/lib/api-keys/types';

const VALID_PERMISSIONS: ApiKeyPermission[] = [
  'transactions:read',
  'wallets:read',
  'portfolio:read',
  'reports:read',
  'webhooks:manage',
];

/**
 * GET /api/api-keys
 * List all API keys (masked)
 */
export async function GET() {
  try {
    const keys = listApiKeys().map((key) => ({
      ...key,
      key: maskApiKey(key.key),
    }));
    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    console.error('API keys GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/api-keys
 * Create a new API key
 *
 * Body: { name: string, permissions: ApiKeyPermission[], rateLimit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, permissions, rateLimit } = body as {
      name?: string;
      permissions?: ApiKeyPermission[];
      rateLimit?: number;
    };

    if (!name || !permissions || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'name and permissions are required' },
        { status: 400 },
      );
    }

    // Validate permissions
    const invalidPerms = permissions.filter(
      (p: string) => !VALID_PERMISSIONS.includes(p as ApiKeyPermission),
    );
    if (invalidPerms.length > 0) {
      return NextResponse.json(
        { error: `Invalid permissions: ${invalidPerms.join(', ')}` },
        { status: 400 },
      );
    }

    const apiKey = generateApiKey(
      name,
      permissions as ApiKeyPermission[],
      rateLimit,
    );

    // Return the full key only on creation
    return NextResponse.json(
      {
        success: true,
        data: apiKey,
        warning: 'Store the key securely. It will not be shown again.',
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error('API keys POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('required') || message.includes('must') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
