/**
 * POST /api/ai/chat/stream
 *
 * Streaming chat with the CryptoBooks AI agent.
 * Uses Server-Sent Events (SSE) to stream tokens in real-time.
 * Falls back to non-streaming if the model doesn't support it.
 */

import { NextRequest } from 'next/server';
import { streamChatWithAgent, chatWithAgent, type AgentContext } from '@/lib/ai/agent';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for streaming

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
      return new Response(
        JSON.stringify({ error: 'messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!context?.userId) {
      return new Response(
        JSON.stringify({ error: 'context.userId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Set default plan if not provided
    if (!context.plan) {
      context.plan = 'starter';
    }

    // Create a TransformStream for SSE
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Stream the response asynchronously
    (async () => {
      try {
        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;

        for await (const event of streamChatWithAgent(messages, context, userData)) {
          if (event.type === 'token') {
            fullContent += event.content;
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: event.content })}\n\n`));
          } else if (event.type === 'usage') {
            inputTokens = event.usage.inputTokens;
            outputTokens = event.usage.outputTokens;
            totalTokens = event.usage.totalTokens;
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'usage', usage: event.usage })}\n\n`));
          } else if (event.type === 'done') {
            fullContent = event.fullContent;
            await writer.write(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              content: fullContent,
              usage: { inputTokens, outputTokens, totalTokens },
              modelUsed: process.env.AI_MODEL || 'openai/o4-mini',
            })}\n\n`));
          } else if (event.type === 'error') {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`));
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);

        // Fallback: try non-streaming response
        try {
          const result = await chatWithAgent(messages, context, userData);
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            content: result.message,
            usage: {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
            },
            modelUsed: result.modelUsed,
            remainingChats: result.remainingChats,
          })}\n\n`));
        } catch (fallbackError) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Failed to get AI response' })}\n\n`));
        }
      } finally {
        await writer.close();
      }
    })();

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('AI Chat Stream API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process streaming request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
