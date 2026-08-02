'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  LogIn,
  MoreHorizontal,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  WalletMinimal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FloatingChatButton } from './floating-chat-button';
import { useWalletStore } from '@/stores/wallet-store';
import {
  CONFIDENCE_COLORS,
  CONFIDENCE_LABELS,
  copyText,
  describeAiError,
  formatGeneratedAt,
  fetchConversationMessages,
  requestChat,
  type AiChatHistoryMessage,
  type AiConfidence,
  type AiErrorKind,
  type AiErrorPresentation,
  type AiNarrativeSource,
  type AiPageContext,
} from '@/lib/ai-client';
import { cn } from '@/lib/utils';

interface ChatMessageMeta {
  source: AiNarrativeSource;
  confidence: AiConfidence;
  periodLabel: string;
  toolCount: number;
  generatedAt: number;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: ChatMessageMeta;
}

interface AIChatProps {
  /** What the user is currently looking at — forwarded so answers stay on topic. */
  pageContext?: AiPageContext;
}

const STARTER_PROMPTS = [
  'Analyze my wallet',
  'Why did my portfolio change?',
  'Where did my capital go?',
  'What should I monitor?',
];

const ERROR_ICONS: Record<AiErrorKind, typeof AlertCircle> = {
  auth: LogIn,
  wallet: WalletMinimal,
  input: WalletMinimal,
  failure: AlertCircle,
};

/** Fallback client history when conversationId is not yet established. */
const MAX_HISTORY_MESSAGES = 10;
const CONVERSATION_STORAGE_KEY = 'radareum.ai.conversationId';

/** `false` while server-rendering, `true` once hydrated — the portal needs a DOM. */
const subscribeToNothing = () => () => {};

export function AIChat({ pageContext }: AIChatProps) {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<AiErrorPresentation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Last question sent, so a failed turn can be replayed. */
  const [lastPrompt, setLastPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showConversationActions, setShowConversationActions] = useState(false);

  const activeWalletId = useWalletStore(state => state.activeWalletId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const abort = abortRef;
    const copyTimer = copyTimerRef;
    return () => {
      abort.current?.abort();
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking, error]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  // Package 3 — restore server conversation on open.
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(CONVERSATION_STORAGE_KEY) : null;
    if (!stored) {
      setHistoryLoaded(true);
      return;
    }
    setConversationId(stored);
    void fetchConversationMessages(stored)
      .then(rows => {
        if (cancelled) return;
        const restored: ChatEntry[] = rows
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
        if (restored.length) setMessages(restored);
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
          setConversationId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, historyLoaded]);

  const send = useCallback(
    async (rawMessage: string, options: { replayLast?: boolean } = {}) => {
      const message = rawMessage.trim();
      if (message.length === 0 || isThinking) return;

      if (!activeWalletId) {
        setError({
          kind: 'wallet',
          title: 'No wallet connected',
          message: 'Connect a wallet first — every answer is built from your verified wallet data.',
          retryable: false,
        });
        return;
      }

      setLastPrompt(message);
      setError(null);

      const history: AiChatHistoryMessage[] = conversationId
        ? []
        : messages
            .slice(-MAX_HISTORY_MESSAGES)
            .map(entry => ({ role: entry.role, content: entry.content }));

      if (!options.replayLast) {
        setMessages(current => [
          ...current,
          { id: createId('user'), role: 'user', content: message },
        ]);
        setInput('');
        resetTextareaHeight(inputRef.current);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsThinking(true);

      try {
        const data = await requestChat(
          {
            walletId: activeWalletId,
            message,
            history,
            conversationId,
            pageContext,
            mode: 'chat',
          },
          controller.signal
        );

        if (controller.signal.aborted) return;

        if (data.conversationId) {
          setConversationId(data.conversationId);
          window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId);
        }

        setMessages(current => [
          ...current,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: data.message || data.narrative,
            meta: {
              source: data.source,
              confidence: data.confidence,
              periodLabel: data.periodLabel,
              toolCount: data.toolsUsed.length,
              generatedAt: data.generatedAt,
            },
          },
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(describeAiError(err));
      } finally {
        if (!controller.signal.aborted) setIsThinking(false);
      }
    },
    [activeWalletId, conversationId, isThinking, messages, pageContext]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  const handleCopy = useCallback(async (id: string, content: string) => {
    const ok = await copyText(content);
    if (!ok) return;
    setCopiedId(id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const clearThread = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsThinking(false);
    setLastPrompt('');
    setConversationId(null);
    setHistoryLoaded(true);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    }
  }, []);

  const renameConversation = async () => {
    if (!conversationId) return;
    const title = window.prompt('Conversation title');
    if (!title?.trim()) return;
    await fetch(`/api/ai/conversations/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    setShowConversationActions(false);
  };
  const archiveConversation = async () => {
    if (!conversationId) return;
    await fetch(`/api/ai/conversations/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) });
    clearThread();
    setShowConversationActions(false);
  };

  const contextLabel = useMemo(() => describeContext(pageContext), [pageContext]);

  if (!mounted) return null;

  const panel = (
    <>
      {!isOpen && <FloatingChatButton onClick={() => setIsOpen(true)} />}

      {isOpen && (
        <div
          className="fixed bottom-24 left-6 z-[100] w-[420px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-[#0a0a0b] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
          role="dialog"
          aria-label="Radareum AI chat"
          data-testid="ai-chat-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/5 bg-[#0f1011]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#0052ff]/10 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-[#0052ff]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-[#f7f8f8]">Radareum AI</p>
                  <Sparkles className="h-3.5 w-3.5 text-[#0052ff]" />
                </div>
                <p className="text-[11px] text-[#8a8f98] truncate">{conversationId ? 'Saved conversation' : contextLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8]" aria-label="Conversation actions" onClick={() => setShowConversationActions(open => !open)}><MoreHorizontal className="h-4 w-4" /></Button>
                {showConversationActions && <div className="absolute right-0 top-8 z-10 w-28 rounded-md border border-white/10 bg-[#191a1b] p-1 text-xs shadow-xl">
                  <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={() => void renameConversation()}>Rename</button>
                  <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5" onClick={clearThread}>New chat</button>
                  <button className="block w-full rounded px-2 py-1.5 text-left text-[#f6465d] hover:bg-white/5" onClick={() => void archiveConversation()}>Archive</button>
                </div>}
              </div>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8a8f98] hover:text-[#f6465d] hover:bg-[#f6465d]/10"
                  onClick={clearThread}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
            {messages.length === 0 && !isThinking && (
              <div className="py-6">
                <div className="w-12 h-12 rounded-xl bg-[#0052ff]/10 flex items-center justify-center mx-auto mb-3">
                  <Bot className="h-6 w-6 text-[#0052ff]" />
                </div>
                <p className="text-sm font-medium text-[#f7f8f8] text-center">
                  Ask about your wallet
                </p>
                <p className="mt-1 text-xs text-[#8a8f98] text-center leading-relaxed">
                  Every answer is built from your synced transactions, holdings and flows — with the
                  evidence behind it.
                </p>
                <div className="mt-4 space-y-2">
                  {STARTER_PROMPTS.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-[#191a1b] border border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:border-[#0052ff]/30 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(message => (
              <div
                key={message.id}
                className={cn('flex gap-2', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
              >
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    message.role === 'user'
                      ? 'bg-[#28282c] text-[#d0d6e0]'
                      : 'bg-[#0052ff]/10 text-[#0052ff]'
                  )}
                >
                  {message.role === 'user' ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>

                <div className="max-w-[82%] min-w-0 group">
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'bg-[#0052ff] text-white rounded-br-sm'
                        : 'bg-[#191a1b] text-[#d0d6e0] border border-white/5 rounded-bl-sm'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-[#f7f8f8] [&_code]:text-[#5b8cff] [&_code]:bg-[#0052ff]/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px]">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{message.content}</span>
                    )}
                  </div>

                  {message.role === 'assistant' && message.meta && (
                    <div className="mt-1 flex items-center gap-2 px-1">
                      <span
                        className="inline-flex items-center gap-1 text-[10px]"
                        style={{ color: CONFIDENCE_COLORS[message.meta.confidence] }}
                        title={`${message.meta.toolCount} engine${message.meta.toolCount === 1 ? '' : 's'} · ${message.meta.periodLabel}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: CONFIDENCE_COLORS[message.meta.confidence] }}
                        />
                        {CONFIDENCE_LABELS[message.meta.confidence]}
                      </span>
                      <span className="text-[10px] text-[#8a8f98]">
                        {formatGeneratedAt(message.meta.generatedAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy(message.id, message.content)}
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#8a8f98] hover:text-[#f7f8f8] inline-flex items-center gap-1"
                        title="Copy response"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3 w-3 text-[#0ecb81]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isThinking && <ThinkingBubble />}

            {error && (
              <ChatError
                error={error}
                onRetry={
                  error.retryable && lastPrompt
                    ? () => void send(lastPrompt, { replayLast: true })
                    : undefined
                }
              />
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-white/5 bg-[#0f1011]">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={event => {
                  setInput(event.target.value);
                  autoGrow(event.target);
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={2000}
                placeholder="Ask about your wallet…"
                disabled={isThinking}
                className="flex-1 resize-none bg-[#191a1b] border border-white/5 rounded-xl px-3 py-2.5 text-sm text-[#d0d6e0] placeholder:text-[#8a8f98] outline-none focus:border-[#0052ff]/40 disabled:opacity-60 max-h-[120px] leading-relaxed"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white shrink-0 disabled:opacity-50"
                onClick={() => void send(input)}
                disabled={input.trim().length === 0 || isThinking}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-[#8a8f98]/70">
              Enter to send · Shift + Enter for a new line
            </p>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(panel, document.body);
}

function ThinkingBubble() {
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full bg-[#0052ff]/10 flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-[#0052ff]" />
      </div>
      <div className="bg-[#191a1b] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8a8f98] animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8a8f98] animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8a8f98] animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="text-[11px] text-[#8a8f98]">Reading your wallet data…</span>
        </div>
      </div>
    </div>
  );
}

function ChatError({ error, onRetry }: { error: AiErrorPresentation; onRetry?: () => void }) {
  const Icon = ERROR_ICONS[error.kind];

  return (
    <div className="flex gap-2 items-start rounded-lg border border-[#f6465d]/15 bg-[#f6465d]/[0.05] p-3">
      <Icon className="h-4 w-4 text-[#f6465d] shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#f7f8f8]">{error.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#8a8f98] break-words">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#d0d6e0] hover:text-[#f7f8f8]"
          >
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function autoGrow(element: HTMLTextAreaElement): void {
  element.style.height = 'auto';
  element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
}

function resetTextareaHeight(element: HTMLTextAreaElement | null): void {
  if (element) element.style.height = 'auto';
}

function describeContext(context: AiPageContext | undefined): string {
  if (!context) return 'Grounded in your wallet data';

  const focus =
    context.asset ??
    context.network ??
    context.counterparty ??
    context.sectionTitle ??
    context.page ??
    context.sectionType;

  return focus ? `Context: ${humanize(focus)}` : 'Grounded in your wallet data';
}

function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
