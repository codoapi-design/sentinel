/**
 * POST /api/ai/chat
 *
 * Chat with the CryptoBooks AI agent.
 * Accepts message history and user context, returns AI response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { chatWithAgent, type AgentContext } from '@/lib/ai/agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      messages,
      context,
      userData,
    }: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      context: AgentContext;
      userData?: Record<string, unknown>;
    } = body;

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array is required' },
        { status: 400 }
      );
    }

    if (!context?.userId) {
      return NextResponse.json(
        { error: 'context.userId is required' },
        { status: 400 }
      );
    }

    // Validate message roles
    for (const msg of messages) {
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        return NextResponse.json(
          { error: 'Invalid message role. Must be "user" or "assistant"' },
          { status: 400 }
        );
      }
    }

    // Set default plan if not provided
    if (!context.plan) {
      context.plan = 'starter';
    }

    // Call the AI agent
    const result = await chatWithAgent(messages, context, userData);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('AI Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
