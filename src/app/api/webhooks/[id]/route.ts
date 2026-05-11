import { NextRequest, NextResponse } from 'next/server';
import {
  getWebhook,
  updateWebhook,
  deleteWebhook,
} from '@/lib/webhooks/service';
import type { WebhookEvent } from '@/lib/webhooks/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/webhooks/[id]
 * Get a single webhook by ID
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const webhook = getWebhook(id);

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: webhook });
  } catch (error) {
    console.error('Webhook GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/webhooks/[id]
 * Update a webhook (url, events, isActive, label)
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { url, events, isActive, label } = body as {
      url?: string;
      events?: WebhookEvent[];
      isActive?: boolean;
      label?: string;
    };

    const updates: Partial<{
      url: string;
      label: string;
      events: WebhookEvent[];
      isActive: boolean;
    }> = {};

    if (url !== undefined) updates.url = url;
    if (label !== undefined) updates.label = label;
    if (events !== undefined) updates.events = events;
    if (isActive !== undefined) updates.isActive = isActive;

    const updated = updateWebhook(id, updates);

    if (!updated) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    console.error('Webhook PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('URL') || message.includes('invalid') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/webhooks/[id]
 * Delete a webhook
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const deleted = deleteWebhook(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    console.error('Webhook DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
