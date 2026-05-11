import { NextRequest, NextResponse } from 'next/server';
import {
  getTicket,
  updateTicket,
  addMessage,
} from '@/lib/support/service';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/lib/support/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/support/[id]
 * Get ticket details with messages
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const ticket = getTicket(id);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error('Support ticket GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/support/[id]
 * Update ticket (add message, change status, etc.)
 *
 * Body: {
 *   status?: TicketStatus,
 *   category?: TicketCategory,
 *   priority?: TicketPriority,
 *   subject?: string,
 *   message?: { content: string, sender: 'user' | 'support' | 'accountant', senderName?: string }
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;

    // Verify ticket exists
    const existing = getTicket(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { status, category, priority, subject, message } = body as {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: TicketPriority;
      subject?: string;
      message?: {
        content: string;
        sender: 'user' | 'support' | 'accountant';
        senderName?: string;
      };
    };

    // Update ticket fields if provided
    const updates: Partial<Pick<typeof existing, 'subject' | 'category' | 'priority' | 'status'>> = {};
    if (subject !== undefined) updates.subject = subject;
    if (category !== undefined) updates.category = category;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length > 0) {
      updateTicket(id, updates);
    }

    // Add message if provided
    if (message?.content) {
      addMessage(id, message.content, message.sender || 'user', message.senderName);
    }

    // Return updated ticket
    const updated = getTicket(id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Support ticket PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
