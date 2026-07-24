'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle, X, Send, Bot, User, Trash2,
  AlertCircle, Sparkles, Copy, Check, Zap,
} from 'lucide-react';
import { useAIStore } from '@/stores/ai-store';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    isTyping,
    chatError,
    sendMessage,
    clearChat,
    usage,
    currentPlan,
    getModelName,
    sendQuickAnalysis,
    currentPage,
    isStreaming,
    streamingMessageId,
    sendMessageStream,
  } = useAIStore();

  // Dynamic model name from store
  const modelName = getModelName();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim() || isTyping) return;

    const message = inputValue.trim();
    setInputValue('');
    // Use streaming for better UX, falls back to non-streaming
    await sendMessageStream(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Copy to clipboard for AI responses
  const handleCopy = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }
  }, []);

  // Quick analysis handler
  const handleQuickAnalysis = useCallback(async () => {
    if (isTyping) return;

    // Build page-specific data description
    const pageDataMap: Record<string, string> = {
      dashboard: 'Dashboard data: Inflow, Outflow, Flow, and Gas Fees',
      transactions: 'Transactions table data: All transactions with filtering and search',
      assets: 'Assets data: Token portfolio, prices, and changes',
      clients: 'Clients data: Transaction counterparties',
      reports: 'Reports data: Financial reports and analysis',
      tax: 'Tax data: Capital gains and losses calculations',
    };

    const pageData = pageDataMap[currentPage] || pageDataMap.dashboard;
    await sendQuickAnalysis(pageData);
  }, [isTyping, currentPage, sendQuickAnalysis]);

  const planLabels: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Business',
    business: 'Business',
  };

  // Model-specific loading messages
  const getLoadingMessage = () => {
    if (modelName.includes('o4') || modelName.includes('o3')) {
      return 'Model is thinking...';
    }
    if (modelName.includes('deepseek')) {
      return 'DeepSeek is analyzing...';
    }
    if (modelName.includes('gemini')) {
      return 'Gemini is processing...';
    }
    return 'Smart Accountant is thinking...';
  };

  return (
    <>
      {/* Chat Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 group relative"
        >
          <div className="w-14 h-14 bg-[#0052ff] hover:bg-[#0045dd] rounded-full shadow-lg shadow-[#0052ff]/25 flex items-center justify-center text-white transition-all duration-300 hover:scale-105">
            <MessageCircle className="h-6 w-6" />
          </div>
          {/* Notification dot for remaining chats */}
          {usage.remainingChats < Infinity && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#0ecb81] rounded-full flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">
                {usage.remainingChats > 99 ? '99+' : usage.remainingChats}
              </span>
            </div>
          )}
          {/* Tooltip */}
          <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 bg-[#191a1b] border border-white/10 rounded-lg text-xs text-[#d0d6e0] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Smart Accountant — Ask me anything
          </div>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-6 left-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] h-[580px] max-h-[calc(100vh-6rem)] bg-[#0a0a0b] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#0f1011]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#0052ff]/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-[#0052ff]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#f7f8f8]">Smart Accountant</p>
                  <Sparkles className="h-3.5 w-3.5 text-[#0052ff]" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse-dot" />
                  <span className="text-[10px] text-[#0ecb81]">Online</span>
                  <span className="text-[10px] text-[#8a8f98]">•</span>
                  <span className="text-[10px] text-[#8a8f98]">{modelName}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Usage badge */}
              {usage.remainingChats < Infinity && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] h-5 px-1.5 border-0",
                    usage.remainingChats < 10 ? "bg-[#f6465d]/10 text-[#f6465d]" : "bg-[#0052ff]/10 text-[#0052ff]"
                  )}
                >
                  {usage.remainingChats} messages
                </Badge>
              )}
              {/* Clear chat */}
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#8a8f98] hover:text-[#f6465d] hover:bg-[#f6465d]/10"
                  onClick={clearChat}
                  title="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[#191a1b]"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Plan & usage info bar */}
          <div className="px-4 py-2 bg-[#0f1011]/50 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-[#8a8f98]">
              Plan {planLabels[currentPlan] || 'Starter'}
            </span>
            <div className="flex items-center gap-2">
              {usage.estimatedCostUsd > 0 && (
                <span className="text-[10px] text-[#8a8f98]">
                  Cost ≈ ${usage.estimatedCostUsd < 0.01 ? '<0.01' : usage.estimatedCostUsd.toFixed(3)}
                </span>
              )}
              <span className="text-[10px] text-[#8a8f98]">
                {usage.chatCount > 0 && `${usage.chatCount} messages this month`}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
            {/* Welcome message if no messages */}
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-[#0052ff]/10 flex items-center justify-center mx-auto mb-3">
                  <Bot className="h-6 w-6 text-[#0052ff]" />
                </div>
                <p className="text-sm font-medium text-[#f7f8f8] mb-2">Hello! I'm your smart accountant</p>
                <p className="text-xs text-[#8a8f98] mb-1">
                  I can analyze your transactions, calculate taxes, and give you financial advice
                </p>
                <p className="text-[10px] text-[#8a8f98]/60 mb-4">
                  Powered by {modelName}
                </p>
                <div className="space-y-2">
                  {[
                    'What are my capital gains this year?',
                    'Analyze my expenses and give tips to reduce them',
                    'How much gas fees did I pay this month?',
                    'What are the risks in my current wallet?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInputValue(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="block w-full text-right text-xs px-3 py-2 rounded-lg bg-[#191a1b] border border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:border-[#0052ff]/30 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
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
                <div
                  className={cn(
                    'max-w-[80%] group relative',
                    message.role === 'user' ? '' : ''
                  )}
                >
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'bg-[#0052ff] text-white rounded-br-sm'
                        : 'bg-[#191a1b] text-[#d0d6e0] border border-white/5 rounded-bl-sm'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>li]:mb-0.5 [&_strong]:text-[#f7f8f8] [&_code]:text-[#0052ff] [&_code]:bg-[#0052ff]/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[11px]">
                        <ReactMarkdown>{message.content || ''}</ReactMarkdown>
                        {/* Show typing cursor for streaming messages */}
                        {isStreaming && message.id === streamingMessageId && (
                          <span className="inline-block w-1.5 h-4 bg-[#0052ff] animate-pulse ml-0.5 align-middle" />
                        )}
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                  {/* Copy button for AI messages */}
                  {message.role === 'assistant' && !message.isSummary && (
                    <button
                      onClick={() => handleCopy(message.id, message.content)}
                      className="absolute -bottom-1 left-2 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded bg-[#28282c] border border-white/5 text-[#8a8f98] hover:text-[#f7f8f8] flex items-center gap-1"
                      title="Copy response"
                    >
                      {copiedMessageId === message.id ? (
                        <>
                          <Check className="h-3 w-3 text-[#0ecb81]" />
                          <span className="text-[9px] text-[#0ecb81]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span className="text-[9px]">Copy</span>
                        </>
                      )}
                    </button>
                  )}
                  {/* Summary badge */}
                  {message.isSummary && (
                    <div className="mt-1 flex items-center gap-1">
                      <Badge className="text-[8px] h-4 px-1 bg-[#8a8f98]/10 text-[#8a8f98] border-0">
                        Previous summary
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator — only show if NOT streaming (streaming shows cursor in message) */}
            {isTyping && !isStreaming && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-[#0052ff]/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-[#0052ff]" />
                </div>
                <div className="bg-[#191a1b] border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#8a8f98] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-[#8a8f98] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-[#8a8f98] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[10px] text-[#8a8f98]">{getLoadingMessage()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {chatError && (
              <div className="flex gap-2 items-start bg-[#f6465d]/5 rounded-lg p-3 border border-[#f6465d]/10">
                <AlertCircle className="h-4 w-4 text-[#f6465d] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#f6465d]">{chatError}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-white/5 bg-[#0f1011]">
            {/* Quick analysis button */}
            <div className="mb-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full h-8 text-[11px] gap-1.5 rounded-lg border border-white/5",
                  "text-[#0052ff] hover:text-[#0052ff] hover:bg-[#0052ff]/5",
                  isTyping && "opacity-50 pointer-events-none"
                )}
                onClick={handleQuickAnalysis}
                disabled={isTyping}
              >
                <Zap className="h-3.5 w-3.5" />
                Quick analysis of current page data
              </Button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your smart accountant..."
                className="flex-1 bg-[#191a1b] border-white/5 text-[#d0d6e0] placeholder-[#8a8f98] text-sm h-10 rounded-xl focus:border-[#0052ff]/30"
                disabled={isTyping}
                maxLength={500}
              />
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 rounded-xl bg-[#0052ff] hover:bg-[#0045dd] text-white flex-shrink-0 disabled:opacity-50"
                disabled={!inputValue.trim() || isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
