import { NextRequest, NextResponse } from 'next/server';
import { getDeliveries, getWebhook } from '@/lib/webhooks/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/webhooks/[id]/deliveries
 * Get delivery history for a webhook
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Verify webhook exists
    const webhook = getWebhook(id);
    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    const deliveries = getDeliveries(id);
    return NextResponse.json({ success: true, data: deliveries });
  } catch (error) {
    console.error('Webhook deliveries GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
