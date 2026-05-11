import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyUsage, getApiKey } from '@/lib/api-keys/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/api-keys/[id]/usage
 * Get usage statistics for an API key
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Verify API key exists
    const apiKey = getApiKey(id);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 },
      );
    }

    const usage = getApiKeyUsage(id);
    return NextResponse.json({ success: true, data: usage });
  } catch (error) {
    console.error('API key usage GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
