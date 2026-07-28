/**
 * POST /api/ai/chat
 *
 * Conversational endpoint. Same pipeline as `/api/ai/analyze` — verified
 * wallet data, planned tools, unified envelopes — rendered in the shorter chat
 * voice (Part 7 §7.8).
 *
 * Follow-ups work by replaying the prior turns: the runtime is stateless, so
 * the client owns the thread and sends it back on each request.
 *
 * Body:
 *   {
 *     walletId: string,                                  // required
 *     message: string,                                   // required
 *     history?: Array<{ role: 'user' | 'assistant', content: string }>,
 *     pageContext?: {
 *       sectionType?, sectionTitle?, page?, asset?, network?,
 *       counterparty?, typeId?, period?, filters?
 *     },
 *     mode?: 'chat' | 'telegram' | 'dashboard',          // defaults to "chat"
 *     includeHidden?: boolean
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';

import type { AgentMode, ChatMessage } from '@/lib/ai/llm';
import { isWalletContextError, recordAiUsage, runAnalysis, summarizeIntelligence } from '@/lib/ai/tools';
import { createCookieServerClient } from '@/lib/supabase/server';

/** Enough context for a follow-up without paying for the whole thread. */
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 4000;
const MAX_MESSAGE_CHARS = 2000;

const AGENT_MODES: readonly AgentMode[] = ['chat', 'dashboard', 'telegram'];

interface ChatRequestBody {
  walletId?: unknown;
  message?: unknown;
  history?: unknown;
  pageContext?: unknown;
  mode?: unknown;
  includeHidden?: unknown;
}

interface PageContextBody {
  sectionType?: unknown;
  sectionTitle?: unknown;
  page?: unknown;
  asset?: unknown;
  network?: unknown;
  counterparty?: unknown;
  typeId?: unknown;
  period?: unknown;
  filters?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const cookieClient = await createCookieServerClient();
    const {
      data: { user },
      error: authError,
    } = await cookieClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: ChatRequestBody;
    try {
      body = (await request.json()) as ChatRequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const walletId = asString(body.walletId);
    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 });
    }

    const message = asString(body.message);
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const pageContext = (body.pageContext ?? {}) as PageContextBody;

    const result = await runAnalysis({
      walletId,
      userId: user.id,
      mode: asMode(body.mode),
      question: message.slice(0, MAX_MESSAGE_CHARS),
      history: asHistory(body.history),
      includeHidden: body.includeHidden === true,
      sectionContext: {
        sectionType: asString(pageContext.sectionType),
        sectionTitle: asString(pageContext.sectionTitle),
        page: asString(pageContext.page),
        asset: asString(pageContext.asset),
        network: asString(pageContext.network),
        counterparty: asString(pageContext.counterparty),
        typeId: asString(pageContext.typeId),
        period: asPeriod(pageContext.period),
        filters: asFilters(pageContext.filters),
      },
    });

    await recordAiUsage({ userId: user.id, kind: 'chat', usage: result.llm.usage });

    return NextResponse.json({
      success: true,
      data: {
        message: result.narrative,
        narrative: result.narrative,
        source: result.source,
        intelligence: summarizeIntelligence(result.intelligence),
        insights: result.insights,
        metrics: result.metrics,
        confidence: result.confidence,
        dataQuality: result.dataQuality,
        toolsUsed: result.toolsUsed,
        analysisMode: result.analysisMode,
        intents: result.plan.intents,
        periodDays: result.periodDays,
        periodLabel: result.periodLabel,
        generatedAt: result.generatedAt,
      },
    });
  } catch (error) {
    if (isWalletContextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      {
        error: 'Chat request failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function asMode(value: unknown): AgentMode {
  return typeof value === 'string' && (AGENT_MODES as readonly string[]).includes(value)
    ? (value as AgentMode)
    : 'chat';
}

/** Keeps the most recent turns, user and assistant only. */
function asHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  const messages: ChatMessage[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;

    const trimmed = content.trim();
    if (trimmed.length === 0) continue;

    messages.push({ role, content: trimmed.slice(0, MAX_HISTORY_CHARS) });
  }

  return messages.slice(-MAX_HISTORY_MESSAGES);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPeriod(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return asString(value);
}

function asFilters(value: unknown): Record<string, string | number | boolean | null> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const filters: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      filters[key] = entry;
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}
