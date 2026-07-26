/**
 * AI Store - Zustand
 *
 * Manages AI agent state: chat history, usage tracking, context.
 * Enhanced with: model name, wallet data integration, conversation summary management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getModelDisplayName,
  DEFAULT_MODEL_ID,
  getModelSpec,
  calculateCost,
  formatCost,
  type ModelCostEstimate,
} from '@/lib/ai/models';
import {
  extractWalletContextFromStorage,
  buildTransactionSummary,
  getPageContextDescription,
  buildUserContext,
  type WalletContext,
  type TransactionSummary,
  type PageContext,
} from '@/lib/ai/context-builder';

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokensUsed?: number;
  /** Whether this message is a summary of older messages */
  isSummary?: boolean;
}

export interface AIUsageStats {
  chatCount: number;
  analysisCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastResetMonth: string; // YYYY-MM format
  remainingChats: number;
  /** Estimated cost in USD this month */
  estimatedCostUsd: number;
}

interface AIState {
  // Chat
  messages: ChatMessage[];
  isTyping: boolean;
  chatError: string | null;

  // Analysis
  isAnalyzing: boolean;
  analysisProgress: number;
  lastAnalysisResult: Record<string, unknown> | null;

  // Usage
  usage: AIUsageStats;

  // Context
  currentPlan: string;
  currentPage: string;

  // Model
  currentModelId: string;

  // Streaming
  isStreaming: boolean;
  streamingMessageId: string | null;
}

interface AIActions {
  // Chat actions
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  setTyping: (typing: boolean) => void;

  // Analysis actions
  startAnalysis: () => void;
  setAnalysisProgress: (progress: number) => void;
  completeAnalysis: (result: Record<string, unknown>) => void;
  resetAnalysis: () => void;

  // Context actions
  setCurrentPlan: (plan: string) => void;
  setCurrentPage: (page: string) => void;

  // Usage actions
  updateUsage: (usage: Partial<AIUsageStats>) => void;
  resetMonthlyUsage: () => void;

  // Model actions
  getModelName: () => string;
  setModelId: (modelId: string) => void;
  getCostEstimate: () => ModelCostEstimate;

  // Wallet data integration
  getWalletContext: () => WalletContext | null;
  getTransactionSummary: () => TransactionSummary | null;
  buildCurrentContext: () => string;

  // Conversation summary management
  trimConversation: (maxMessages?: number) => void;
  getConversationSummary: () => string;

  // Helper
  getUserContext: () => {
    userId: string;
    plan: string;
    page: string;
    walletContext: WalletContext | null;
    transactionSummary: TransactionSummary | null;
    pageContext: PageContext | null;
  };

  // Quick analysis
  sendQuickAnalysis: (pageData: string) => Promise<void>;

  // Streaming chat
  sendMessageStream: (content: string) => Promise<void>;
}

// ============================================================
// Plan Limits
// ============================================================

const PLAN_CHAT_LIMITS: Record<string, number> = {
  starter: 100,
  pro: 500,
  enterprise: Infinity,
};

// ============================================================
// Conversation Summary Constants
// ============================================================

/** Maximum messages to keep before trimming */
const MAX_MESSAGES_BEFORE_TRIM = 40;

/** Number of recent messages to preserve during trimming */
const MESSAGES_TO_PRESERVE = 10;

/** Maximum characters for a conversation summary */
const MAX_SUMMARY_LENGTH = 500;

// ============================================================
// Store
// ============================================================

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const initialState: AIState = {
  messages: [],
  isTyping: false,
  chatError: null,
  isAnalyzing: false,
  analysisProgress: 0,
  lastAnalysisResult: null,
  usage: {
    chatCount: 0,
    analysisCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastResetMonth: getCurrentMonth(),
    remainingChats: 100,
    estimatedCostUsd: 0,
  },
  currentPlan: 'starter',
  currentPage: 'dashboard',
  currentModelId: DEFAULT_MODEL_ID,
  isStreaming: false,
  streamingMessageId: null,
};

export const useAIStore = create<AIState & AIActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // ====== Model Actions ======

      getModelName: () => {
        return getModelDisplayName(get().currentModelId);
      },

      setModelId: (modelId: string) => {
        set({ currentModelId: modelId });
      },

      getCostEstimate: () => {
        const state = get();
        return calculateCost(
          state.currentModelId,
          state.usage.totalInputTokens,
          state.usage.totalOutputTokens
        );
      },

      // ====== Chat Actions ======

      sendMessage: async (content: string) => {
        const state = get();

        // Check rate limit
        if (state.usage.remainingChats <= 0 && state.currentPlan !== 'enterprise') {
          set({
            chatError: 'You\'ve reached the message limit for your plan. Upgrade to get more.',
          });
          return;
        }

        // Trim conversation if it's getting too long (before adding new message)
        if (state.messages.length >= MAX_MESSAGES_BEFORE_TRIM) {
          get().trimConversation(MESSAGES_TO_PRESERVE);
        }

        // Add user message
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        set(state => ({
          messages: [...state.messages, userMessage],
          isTyping: true,
          chatError: null,
        }));

        try {
          // Prepare message history for API (last 20 messages for context window)
          const recentMessages = get().messages.slice(-20).map(m => ({
            role: m.role,
            content: m.content,
          }));
          // Make sure the current user message is included
          if (!recentMessages.some(m => m.content === content)) {
            recentMessages.push({ role: 'user', content });
          }

          // Build rich user data context using context builder
          const walletContext = get().getWalletContext();
          const transactionSummary = get().getTransactionSummary();
          const pageContext = getPageContextDescription(state.currentPage);

          const builtContext = buildUserContext({
            walletContext,
            transactionSummary,
            pageContext,
            modelId: state.currentModelId,
          });

          // Build userData object for backward compatibility
          let userData: Record<string, unknown> | undefined;
          if (walletContext) {
            userData = {
              walletCount: walletContext.walletCount,
              activeWalletId: walletContext.activeWalletId,
              activeWalletLabel: walletContext.activeWalletLabel,
              transactionCount: walletContext.transactionCount,
              currentPlan: walletContext.currentPlan,
              // Include transaction summary if available
              ...(transactionSummary ? {
                financialSummary: {
                  totalIncome: transactionSummary.totalIncome,
                  totalExpenses: transactionSummary.totalExpenses,
                  netFlow: transactionSummary.netFlow,
                  gasFees: transactionSummary.gasFees,
                  topTokens: transactionSummary.topTokens,
                  topNetworks: transactionSummary.topNetworks,
                },
              } : {}),
              // Include built context string for richer AI understanding
              builtContext: builtContext.contextString,
            };
          }

          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: recentMessages,
              context: {
                userId: 'user-session', // Will be replaced with real auth
                plan: state.currentPlan,
                page: state.currentPage,
              },
              userData,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get AI response');
          }

          const result = await response.json();

          if (result.success && result.data) {
            // Calculate cost for this interaction
            const interactionCost = calculateCost(
              state.currentModelId,
              result.data.usage?.inputTokens || 0,
              result.data.usage?.outputTokens || 0
            );

            const aiMessage: ChatMessage = {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: result.data.message,
              timestamp: Date.now(),
              tokensUsed: result.data.usage?.totalTokens || 0,
            };

            set(state => ({
              messages: [...state.messages, aiMessage],
              isTyping: false,
              usage: {
                ...state.usage,
                chatCount: state.usage.chatCount + 1,
                totalInputTokens: state.usage.totalInputTokens + (result.data.usage?.inputTokens || 0),
                totalOutputTokens: state.usage.totalOutputTokens + (result.data.usage?.outputTokens || 0),
                remainingChats: result.data.remainingChats ?? Math.max(0, (PLAN_CHAT_LIMITS[state.currentPlan] || 100) - state.usage.chatCount - 1),
                estimatedCostUsd: state.usage.estimatedCostUsd + interactionCost.costUsd,
              },
            }));
          } else {
            throw new Error(result.error || 'Unknown error');
          }
        } catch (error) {
          console.error('AI Chat error:', error);

          // Fallback response when API is unavailable
          const fallbackMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, I couldn\'t process your request right now. Please try again.',
            timestamp: Date.now(),
          };

          set(state => ({
            messages: [...state.messages, fallbackMessage],
            isTyping: false,
            chatError: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      },

      clearChat: () => {
        set({ messages: [], chatError: null });
      },

      setTyping: (typing: boolean) => {
        set({ isTyping: typing });
      },

      // ====== Analysis Actions ======

      startAnalysis: () => {
        set({ isAnalyzing: true, analysisProgress: 0, lastAnalysisResult: null });
      },

      setAnalysisProgress: (progress: number) => {
        set({ analysisProgress: progress });
      },

      completeAnalysis: (result: Record<string, unknown>) => {
        set({
          isAnalyzing: false,
          analysisProgress: 100,
          lastAnalysisResult: result,
          usage: {
            ...get().usage,
            analysisCount: get().usage.analysisCount + 1,
          },
        });
      },

      resetAnalysis: () => {
        set({
          isAnalyzing: false,
          analysisProgress: 0,
          lastAnalysisResult: null,
        });
      },

      // ====== Context Actions ======

      setCurrentPlan: (plan: string) => {
        set({
          currentPlan: plan,
          usage: {
            ...get().usage,
            remainingChats: PLAN_CHAT_LIMITS[plan] ?? 100,
          },
        });
      },

      setCurrentPage: (page: string) => {
        set({ currentPage: page });
      },

      // ====== Usage Actions ======

      updateUsage: (usage: Partial<AIUsageStats>) => {
        set(state => ({
          usage: { ...state.usage, ...usage },
        }));
      },

      resetMonthlyUsage: () => {
        set({
          usage: {
            chatCount: 0,
            analysisCount: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            lastResetMonth: getCurrentMonth(),
            remainingChats: PLAN_CHAT_LIMITS[get().currentPlan] ?? 100,
            estimatedCostUsd: 0,
          },
        });
      },

      // ====== Wallet Data Integration ======

      getWalletContext: () => {
        return extractWalletContextFromStorage();
      },

      getTransactionSummary: () => {
        const walletCtx = get().getWalletContext();
        if (!walletCtx?.activeWalletId) return null;

        try {
          const raw =
            localStorage.getItem('sentinel-wallets') ||
            localStorage.getItem('cryptobooks-wallets');
          if (!raw) return null;

          const parsed = JSON.parse(raw);
          const walletId = walletCtx.activeWalletId;
          const transactions = parsed?.state?.transactionsMap?.[walletId];
          if (!Array.isArray(transactions) || transactions.length === 0) return null;

          const clients = parsed?.state?.clientsMap?.[walletId] || [];
          return buildTransactionSummary(transactions, clients);
        } catch {
          return null;
        }
      },

      buildCurrentContext: () => {
        const state = get();
        const walletContext = get().getWalletContext();
        const transactionSummary = get().getTransactionSummary();
        const pageContext = getPageContextDescription(state.currentPage);

        const built = buildUserContext({
          walletContext,
          transactionSummary,
          pageContext,
          modelId: state.currentModelId,
        });

        return built.contextString;
      },

      // ====== Conversation Summary Management ======

      trimConversation: (maxMessages: number = MESSAGES_TO_PRESERVE) => {
        const state = get();
        if (state.messages.length <= maxMessages) return;

        // Keep the most recent messages
        const recentMessages = state.messages.slice(-maxMessages);

        // Generate a summary of the trimmed messages
        const trimmedMessages = state.messages.slice(0, -maxMessages);
        const summaryContent = generateSummaryFromMessages(trimmedMessages);

        // Prepend summary as a system-like message
        const summaryMessage: ChatMessage = {
          id: `summary-${Date.now()}`,
          role: 'assistant',
          content: summaryContent,
          timestamp: trimmedMessages[trimmedMessages.length - 1]?.timestamp || Date.now(),
          isSummary: true,
        };

        set({
          messages: [summaryMessage, ...recentMessages],
        });
      },

      getConversationSummary: () => {
        const messages = get().messages;
        if (messages.length === 0) return '';
        return generateSummaryFromMessages(messages);
      },

      // ====== Quick Analysis ======

      sendQuickAnalysis: async (pageData: string) => {
        const state = get();

        if (state.usage.remainingChats <= 0 && state.currentPlan !== 'enterprise') {
          set({
            chatError: 'You\'ve reached the message limit for your plan. Upgrade to get more.',
          });
          return;
        }

        // Add user message
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: `Quickly analyze the following data: ${pageData}`,
          timestamp: Date.now(),
        };

        set(state => ({
          messages: [...state.messages, userMessage],
          isTyping: true,
          chatError: null,
        }));

        try {
          const walletContext = get().getWalletContext();
          const transactionSummary = get().getTransactionSummary();
          const pageContext = getPageContextDescription(state.currentPage);

          const builtContext = buildUserContext({
            walletContext,
            transactionSummary,
            pageContext,
            modelId: state.currentModelId,
            maxTokens: 2000,
          });

          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                { role: 'user', content: `Quickly analyze the following data: ${pageData}` },
              ],
              context: {
                userId: 'user-session',
                plan: state.currentPlan,
                page: state.currentPage,
              },
              userData: {
                builtContext: builtContext.contextString,
                isQuickAnalysis: true,
              },
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get AI response');
          }

          const result = await response.json();

          if (result.success && result.data) {
            const interactionCost = calculateCost(
              state.currentModelId,
              result.data.usage?.inputTokens || 0,
              result.data.usage?.outputTokens || 0
            );

            const aiMessage: ChatMessage = {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: result.data.message,
              timestamp: Date.now(),
              tokensUsed: result.data.usage?.totalTokens || 0,
            };

            set(state => ({
              messages: [...state.messages, aiMessage],
              isTyping: false,
              usage: {
                ...state.usage,
                chatCount: state.usage.chatCount + 1,
                totalInputTokens: state.usage.totalInputTokens + (result.data.usage?.inputTokens || 0),
                totalOutputTokens: state.usage.totalOutputTokens + (result.data.usage?.outputTokens || 0),
                remainingChats: result.data.remainingChats ?? Math.max(0, (PLAN_CHAT_LIMITS[state.currentPlan] || 100) - state.usage.chatCount - 1),
                estimatedCostUsd: state.usage.estimatedCostUsd + interactionCost.costUsd,
              },
            }));
          } else {
            throw new Error(result.error || 'Unknown error');
          }
        } catch (error) {
          console.error('Quick Analysis error:', error);

          const fallbackMessage: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, I couldn\'t analyze the data right now. Please try again.',
            timestamp: Date.now(),
          };

          set(state => ({
            messages: [...state.messages, fallbackMessage],
            isTyping: false,
            chatError: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      },

      // ====== Streaming Chat ======

      sendMessageStream: async (content: string) => {
        const state = get();

        // Check rate limit
        if (state.usage.remainingChats <= 0 && state.currentPlan !== 'enterprise') {
          set({
            chatError: 'You\'ve reached the message limit for your plan. Upgrade to get more.',
          });
          return;
        }

        // Trim conversation if it's getting too long
        if (state.messages.length >= MAX_MESSAGES_BEFORE_TRIM) {
          get().trimConversation(MESSAGES_TO_PRESERVE);
        }

        // Add user message
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content,
          timestamp: Date.now(),
        };

        // Create a placeholder for the streaming AI message
        const aiMessageId = `ai-stream-${Date.now()}`;

        set(state => ({
          messages: [...state.messages, userMessage],
          isTyping: true,
          isStreaming: true,
          streamingMessageId: aiMessageId,
          chatError: null,
        }));

        // Add empty AI message that will be updated with streaming tokens
        const aiPlaceholder: ChatMessage = {
          id: aiMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };

        set(state => ({
          messages: [...state.messages, aiPlaceholder],
        }));

        try {
          // Prepare message history
          const recentMessages = get().messages
            .filter(m => m.id !== aiMessageId) // Exclude the streaming placeholder
            .slice(-20)
            .map(m => ({
              role: m.role,
              content: m.content,
            }));

          // Build rich user data context
          const walletContext = get().getWalletContext();
          const transactionSummary = get().getTransactionSummary();
          const pageContext = getPageContextDescription(state.currentPage);

          const builtContext = buildUserContext({
            walletContext,
            transactionSummary,
            pageContext,
            modelId: state.currentModelId,
          });

          let userData: Record<string, unknown> | undefined;
          if (walletContext) {
            userData = {
              walletCount: walletContext.walletCount,
              activeWalletId: walletContext.activeWalletId,
              activeWalletLabel: walletContext.activeWalletLabel,
              transactionCount: walletContext.transactionCount,
              currentPlan: walletContext.currentPlan,
              ...(transactionSummary ? {
                financialSummary: {
                  totalIncome: transactionSummary.totalIncome,
                  totalExpenses: transactionSummary.totalExpenses,
                  netFlow: transactionSummary.netFlow,
                  gasFees: transactionSummary.gasFees,
                  topTokens: transactionSummary.topTokens,
                  topNetworks: transactionSummary.topNetworks,
                },
              } : {}),
              builtContext: builtContext.contextString,
            };
          }

          // Try streaming first
          const response = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: recentMessages,
              context: {
                userId: 'user-session',
                plan: state.currentPlan,
                page: state.currentPage,
              },
              userData,
            }),
          });

          // Check if response is SSE
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') && response.body) {
            // Process SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (!data) continue;

                  try {
                    const parsed = JSON.parse(data);

                    if (parsed.type === 'token' && parsed.content) {
                      fullContent += parsed.content;
                      // Update the streaming message in place
                      set(state => ({
                        messages: state.messages.map(m =>
                          m.id === aiMessageId
                            ? { ...m, content: fullContent }
                            : m
                        ),
                      }));
                    } else if (parsed.type === 'done') {
                      const finalContent = parsed.content || fullContent;
                      const usage = parsed.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
                      const interactionCost = calculateCost(
                        state.currentModelId,
                        usage.inputTokens,
                        usage.outputTokens
                      );

                      set(state => ({
                        messages: state.messages.map(m =>
                          m.id === aiMessageId
                            ? { ...m, content: finalContent, tokensUsed: usage.totalTokens }
                            : m
                        ),
                        isTyping: false,
                        isStreaming: false,
                        streamingMessageId: null,
                        usage: {
                          ...state.usage,
                          chatCount: state.usage.chatCount + 1,
                          totalInputTokens: state.usage.totalInputTokens + usage.inputTokens,
                          totalOutputTokens: state.usage.totalOutputTokens + usage.outputTokens,
                          remainingChats: parsed.remainingChats ?? Math.max(0, (PLAN_CHAT_LIMITS[state.currentPlan] || 100) - state.usage.chatCount - 1),
                          estimatedCostUsd: state.usage.estimatedCostUsd + interactionCost.costUsd,
                        },
                      }));
                    } else if (parsed.type === 'error') {
                      throw new Error(parsed.error || 'Streaming error');
                    }
                  } catch {
                    // Skip malformed SSE data
                  }
                }
              }
            }
          } else {
            // Non-streaming fallback — use the regular chat endpoint
            const fallbackResponse = await fetch('/api/ai/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: recentMessages,
                context: {
                  userId: 'user-session',
                  plan: state.currentPlan,
                  page: state.currentPage,
                },
                userData,
              }),
            });

            if (!fallbackResponse.ok) {
              throw new Error('Failed to get AI response');
            }

            const result = await fallbackResponse.json();

            if (result.success && result.data) {
              const interactionCost = calculateCost(
                state.currentModelId,
                result.data.usage?.inputTokens || 0,
                result.data.usage?.outputTokens || 0
              );

              set(state => ({
                messages: state.messages.map(m =>
                  m.id === aiMessageId
                    ? { ...m, content: result.data.message, tokensUsed: result.data.usage?.totalTokens || 0 }
                    : m
                ),
                isTyping: false,
                isStreaming: false,
                streamingMessageId: null,
                usage: {
                  ...state.usage,
                  chatCount: state.usage.chatCount + 1,
                  totalInputTokens: state.usage.totalInputTokens + (result.data.usage?.inputTokens || 0),
                  totalOutputTokens: state.usage.totalOutputTokens + (result.data.usage?.outputTokens || 0),
                  remainingChats: result.data.remainingChats ?? Math.max(0, (PLAN_CHAT_LIMITS[state.currentPlan] || 100) - state.usage.chatCount - 1),
                  estimatedCostUsd: state.usage.estimatedCostUsd + interactionCost.costUsd,
                },
              }));
            } else {
              throw new Error(result.error || 'Unknown error');
            }
          }
        } catch (error) {
          console.error('Streaming Chat error:', error);

          // Update the streaming message with error info
          set(state => ({
            messages: state.messages.map(m =>
              m.id === aiMessageId
                ? { ...m, content: 'Sorry, I couldn\'t process your request right now. Please try again.' }
                : m
            ),
            isTyping: false,
            isStreaming: false,
            streamingMessageId: null,
            chatError: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      },

      // ====== Helper ======

      getUserContext: () => {
        const state = get();
        // Check if we need to reset monthly usage
        if (state.usage.lastResetMonth !== getCurrentMonth()) {
          get().resetMonthlyUsage();
        }
        return {
          userId: 'user-session',
          plan: state.currentPlan,
          page: state.currentPage,
          walletContext: get().getWalletContext(),
          transactionSummary: get().getTransactionSummary(),
          pageContext: getPageContextDescription(state.currentPage),
        };
      },
    }),
    {
      name: 'cryptobooks-ai',
      partialize: (state) => ({
        messages: state.messages.slice(-50), // Persist only last 50 messages
        usage: state.usage,
        currentPlan: state.currentPlan,
        currentModelId: state.currentModelId,
      }),
    }
  )
);

// ============================================================
// Conversation Summary Helper
// ============================================================

/**
 * Generate a brief summary from a list of chat messages.
 * This runs locally without an API call to save tokens.
 */
function generateSummaryFromMessages(messages: ChatMessage[]): string {
  if (messages.length === 0) return '';

  const userMessages = messages.filter(m => m.role === 'user');
  const aiMessages = messages.filter(m => m.role === 'assistant');

  // Extract key topics from user messages
  const topics: string[] = [];
  for (const msg of userMessages) {
    const content = msg.content.trim();
    if (content.length > 0) {
      // Take first 80 chars of each user message as topic
      const topic = content.length > 80 ? content.slice(0, 80) + '...' : content;
      topics.push(topic);
    }
  }

  if (topics.length === 0) return '';

  const summaryParts = topics.slice(0, 5); // Max 5 topics
  const summaryText = `Previous conversation summary (${messages.length} messages):\n${summaryParts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  // Truncate if needed
  if (summaryText.length > MAX_SUMMARY_LENGTH) {
    return summaryText.slice(0, MAX_SUMMARY_LENGTH) + '...';
  }

  return summaryText;
}
