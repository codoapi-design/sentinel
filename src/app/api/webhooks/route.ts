import { NextRequest, NextResponse } from 'next/server';
import {
  listWebhooks,
  createWebhook,
} from '@/lib/webhooks/service';
import type { WebhookEvent } from '@/lib/webhooks/types';

const VALID_EVENTS: WebhookEvent[] = [
  'transaction.incoming',
  'transaction.outgoing',
  'transaction.large',
  'wallet.threshold_reached',
  'asset.price_rise',
  'asset.price_drop',
  'gas.fee_exceeded',
  'report.weekly',
  'report.monthly',
];

/**
 * GET /api/webhooks
 * List all webhooks
 */
export async function GET() {
  try {
    const webhooks = listWebhooks();
    return NextResponse.json({ success: true, data: webhooks });
  } catch (error) {
    console.error('Webhooks GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/webhooks
 * Create a new webhook endpoint
 *
 * Body: { url: string, label: string, events: WebhookEvent[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, label, events } = body as {
      url?: string;
      label?: string;
      events?: WebhookEvent[];
    };

    if (!url || !label || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'url, label, and events are required' },
        { status: 400 },
      );
    }

    // Validate events
    const invalidEvents = events.filter(
      (e: string) => !VALID_EVENTS.includes(e as WebhookEvent),
    );
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 },
      );
    }

    const webhook = createWebhook(url, label, events as WebhookEvent[]);
    return NextResponse.json({ success: true, data: webhook }, { status: 201 });
  } catch (error: unknown) {
    console.error('Webhooks POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('URL') || message.includes('invalid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
