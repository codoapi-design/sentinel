import { NextRequest, NextResponse } from 'next/server';
import { listTickets, createTicket } from '@/lib/support/service';
import type { TicketCategory, TicketPriority, TicketStatus } from '@/lib/support/types';

const VALID_CATEGORIES: TicketCategory[] = [
  'technical',
  'billing',
  'accounting',
  'feature_request',
  'bug',
];

const VALID_PRIORITIES: TicketPriority[] = [
  'low',
  'medium',
  'high',
  'urgent',
];

/**
 * GET /api/support
 * List tickets with optional filters
 *
 * Query params:
 * - status: TicketStatus
 * - category: TicketCategory
 * - priority: TicketPriority
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as TicketStatus | null;
    const category = searchParams.get('category') as TicketCategory | null;
    const priority = searchParams.get('priority') as TicketPriority | null;

    const tickets = listTickets({
      status: status || undefined,
      category: category || undefined,
      priority: priority || undefined,
    });

    return NextResponse.json({ success: true, data: tickets });
  } catch (error) {
    console.error('Support GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/support
 * Create a new support ticket
 *
 * Body: { subject: string, description: string, category: TicketCategory, priority: TicketPriority }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject, description, category, priority } = body as {
      subject?: string;
      description?: string;
      category?: TicketCategory;
      priority?: TicketPriority;
    };

    if (!subject || !description) {
      return NextResponse.json(
        { error: 'subject and description are required' },
        { status: 400 },
      );
    }

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `category is required and must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      );
    }

    if (!priority || !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { error: `priority is required and must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 },
      );
    }

    const ticket = createTicket(subject, description, category, priority);
    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error: unknown) {
    console.error('Support POST error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
